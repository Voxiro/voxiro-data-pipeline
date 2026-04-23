/**
 * Geocoder service — converts Lagos location names to lat/lng coordinates.
 *
 * Uses a 3-layer strategy to minimise Google Geocoding API calls:
 *   Layer 1: In-memory cache (fastest, resets on pipeline restart)
 *   Layer 2: Hardcoded Lagos knowledge base (instant, free, covers top 35+ locations)
 *   Layer 3: Firestore persistent cache (survives restarts, shared across runs)
 *   Layer 4: Google Geocoding API (last resort, rate-limited, paid after 10k/mo)
 *
 * The cascade means a location is geocoded ONCE ever, then served from cache forever.
 * In practice this keeps API usage to ~20–50 calls/month for the Voxiro pipeline.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getFirestore, COLLECTIONS } from "../lib/firebase";
import { KNOWN_LAGOS_LOCATIONS } from "../data/locations";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Coordinates {
	lat: number;
	lng: number;
}

export interface GeocodeResult extends Coordinates {
	/** Normalised address returned by Google, or the input if from hardcoded list */
	formattedAddress: string;
	/** Which layer served this result — useful for logging/debugging */
	source: "memory" | "hardcoded" | "firestore" | "google";
}

interface CachedEntry {
	lat: number;
	lng: number;
	formattedAddress: string;
	/** When this entry was written. Used for TTL refresh (Google ToS: 30 days max) */
	cachedAt: FirebaseFirestore.Timestamp;
	/** Original query string that produced this result */
	originalQuery: string;
}

// ─── Config ────────────────────────────────────────────────────────────────

const GEOCODE_CACHE_COLLECTION = COLLECTIONS.GEOCODE_CACHE;

/**
 * Google's ToS allows caching geocoded results for up to 30 days.
 * We refresh at 28 days to be safe.
 */
const CACHE_TTL_MS = 28 * 24 * 60 * 60 * 1000;

/** Lagos bounding box — biases Google results to the right city */
const LAGOS_REGION = "ng";
const LAGOS_BOUNDS = "6.3928,2.6965|6.7028,3.6717"; // SW|NE corners

// In-memory cache for the current pipeline run (cleared on restart)
const memoryCache = new Map<string, GeocodeResult>();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Geocode a Lagos location name to coordinates.
 * Returns null if no result can be found from any layer.
 *
 * @param locationName — e.g. "Lekki Phase 1", "Third Mainland Bridge", "Ikeja"
 */
export async function geocode(
	locationName: string,
): Promise<GeocodeResult | null> {
	const key = normaliseKey(locationName);
	if (!key) return null;

	// Layer 1: in-memory cache
	const memHit = memoryCache.get(key);
	if (memHit) return memHit;

	// Layer 2: hardcoded knowledge base
	const hardcoded = KNOWN_LAGOS_LOCATIONS[key];
	if (hardcoded) {
		const result: GeocodeResult = {
			...hardcoded,
			formattedAddress: locationName,
			source: "hardcoded",
		};
		memoryCache.set(key, result);
		return result;
	}

	// Layer 3: Firestore persistent cache
	const firestoreHit = await readFromFirestoreCache(key);
	if (firestoreHit) {
		memoryCache.set(key, firestoreHit);
		return firestoreHit;
	}

	// Layer 4: Google Geocoding API
	const googleResult = await callGoogleGeocodingApi(locationName);
	if (googleResult) {
		memoryCache.set(key, googleResult);
		await writeToFirestoreCache(key, locationName, googleResult);
		return googleResult;
	}

	return null;
}

/**
 * Geocode many location names at once.
 * Runs sequentially to avoid hammering Google's rate limit (3000 QPM).
 * Returns a map from input name → result (or null if not found).
 */
export async function geocodeBatch(
	names: string[],
): Promise<Map<string, GeocodeResult | null>> {
	const results = new Map<string, GeocodeResult | null>();
	for (const name of names) {
		results.set(name, await geocode(name));
	}
	return results;
}

// ─── Layer 3: Firestore cache helpers ──────────────────────────────────────

async function readFromFirestoreCache(
	key: string,
): Promise<GeocodeResult | null> {
	try {
		const doc = await getFirestore()
			.collection(GEOCODE_CACHE_COLLECTION)
			.doc(key)
			.get();
		if (!doc.exists) return null;

		const data = doc.data() as CachedEntry | undefined;
		if (!data) return null;

		// Respect Google's 30-day caching limit
		const ageMs = Date.now() - data.cachedAt.toMillis();
		if (ageMs > CACHE_TTL_MS) {
			// Entry is stale — delete it and return null so we re-geocode
			await getFirestore().collection(GEOCODE_CACHE_COLLECTION).doc(key).delete();
			return null;
		}

		return {
			lat: data.lat,
			lng: data.lng,
			formattedAddress: data.formattedAddress,
			source: "firestore",
		};
	} catch (err) {
		console.error(
			`[geocoder] Firestore cache read failed for "${key}":`,
			err,
		);
		// Fail open — if the cache is down, fall through to Google
		return null;
	}
}

async function writeToFirestoreCache(
	key: string,
	originalQuery: string,
	result: GeocodeResult,
): Promise<void> {
	try {
		await getFirestore().collection(GEOCODE_CACHE_COLLECTION).doc(key).set({
			lat: result.lat,
			lng: result.lng,
			formattedAddress: result.formattedAddress,
			originalQuery,
			cachedAt: FieldValue.serverTimestamp(),
		});
	} catch (err) {
		// Non-fatal — we have the result in memory, just couldn't persist it
		console.error(
			`[geocoder] Firestore cache write failed for "${key}":`,
			err,
		);
	}
}

// ─── Layer 4: Google Geocoding API ─────────────────────────────────────────

interface GoogleGeocodeResponse {
	status: string;
	results: Array<{
		formatted_address: string;
		geometry: {
			location: { lat: number; lng: number };
		};
	}>;
	error_message?: string;
}

async function callGoogleGeocodingApi(
	locationName: string,
): Promise<GeocodeResult | null> {
	const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
	if (!apiKey) {
		console.warn(
			`[geocoder] GOOGLE_GEOCODING_API_KEY not set — skipping "${locationName}"`,
		);
		return null;
	}

	// Append ", Lagos, Nigeria" to disambiguate
	// (e.g. "Victoria Island" also exists in Hong Kong)
	const address = `${locationName}, Lagos, Nigeria`;

	const params = new URLSearchParams({
		address,
		region: LAGOS_REGION,
		bounds: LAGOS_BOUNDS,
		key: apiKey,
	});

	const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

	try {
		const res = await fetch(url);
		if (!res.ok) {
			console.error(
				`[geocoder] Google API HTTP ${res.status} for "${locationName}"`,
			);
			return null;
		}

		const data = (await res.json()) as GoogleGeocodeResponse;

		if (data.status === "ZERO_RESULTS") {
			console.warn(`[geocoder] No results for "${locationName}"`);
			return null;
		}

		if (data.status === "OVER_QUERY_LIMIT") {
			console.error(
				`[geocoder] Google quota exceeded — check GCP console quotas`,
			);
			return null;
		}

		if (data.status !== "OK") {
			console.error(
				`[geocoder] Google API error for "${locationName}": ${data.status} ${data.error_message ?? ""}`,
			);
			return null;
		}

		const first = data.results[0];
		if (!first) return null;

		// Sanity check: result should be inside Lagos bounding box
		const { lat, lng } = first.geometry.location;
		if (!isWithinLagos(lat, lng)) {
			console.warn(
				`[geocoder] Google returned out-of-Lagos result for "${locationName}": ${lat},${lng}`,
			);
			return null;
		}

		return {
			lat,
			lng,
			formattedAddress: first.formatted_address,
			source: "google",
		};
	} catch (err) {
		console.error(
			`[geocoder] Google API call failed for "${locationName}":`,
			err,
		);
		return null;
	}
}

// ─── Utilities ─────────────────────────────────────────────────────────────

/**
 * Normalise a location name into a cache key.
 * Strips whitespace, lowercases, removes punctuation, collapses spaces.
 * This means "Lekki Phase 1", "lekki phase 1", "  LEKKI  PHASE 1 " all
 * produce the same key → same cache hit.
 */
function normaliseKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/-/g, " ")          // treat hyphens as spaces ("Lekki-Epe" → "lekki epe")
		.replace(/[^a-z0-9\s]/g, "") // strip remaining punctuation (commas, dots, etc.)
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Cheap bounding-box check. Lagos state roughly spans:
 *   Lat: 6.39 – 6.70   Lng: 2.70 – 3.67
 * We pad slightly for neighbouring Ogun state reports (Mowe, Ibafo, etc.)
 */
function isWithinLagos(lat: number, lng: number): boolean {
	return lat >= 6.2 && lat <= 6.9 && lng >= 2.5 && lng <= 4.0;
}

/**
 * Test helper — clears the in-memory cache.
 * Does NOT touch Firestore. Use sparingly.
 */
export function _clearMemoryCacheForTests(): void {
	memoryCache.clear();
}

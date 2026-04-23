// src/processors/parseReport.ts
// Keyword-based report parser — no API key needed
// Parses raw RSS text into structured Area Intel reports
// Can be swapped for Claude API later when ready

import { logger } from "../lib/logger";
import type { ParsedReport, ReportType, ReportSeverity } from "../types/report";
import type { RSSItem } from "../types/report";

// -------------------------------------------------------
// LAGOS KNOWLEDGE BASE
// -------------------------------------------------------

// Known Lagos areas — used to extract location from text
const LAGOS_AREAS: Record<string, { area: string; fullName: string }> = {
	"lekki phase 1": { area: "Lekki", fullName: "Lekki Phase 1, Lagos" },
	"lekki phase 2": { area: "Lekki", fullName: "Lekki Phase 2, Lagos" },
	lekki: { area: "Lekki", fullName: "Lekki, Lagos" },
	ajah: { area: "Ajah", fullName: "Ajah, Lagos" },
	sangotedo: { area: "Sangotedo", fullName: "Sangotedo, Lagos" },
	"victoria island": {
		area: "Victoria Island",
		fullName: "Victoria Island, Lagos",
	},
	" vi ": { area: "Victoria Island", fullName: "Victoria Island, Lagos" },
	ikoyi: { area: "Ikoyi", fullName: "Ikoyi, Lagos" },
	ikeja: { area: "Ikeja", fullName: "Ikeja, Lagos" },
	surulere: { area: "Surulere", fullName: "Surulere, Lagos" },
	yaba: { area: "Yaba", fullName: "Yaba, Lagos" },
	oshodi: { area: "Oshodi", fullName: "Oshodi, Lagos" },
	apapa: { area: "Apapa", fullName: "Apapa, Lagos" },
	ikorodu: { area: "Ikorodu", fullName: "Ikorodu, Lagos" },
	festac: { area: "Festac", fullName: "Festac Town, Lagos" },
	agege: { area: "Agege", fullName: "Agege, Lagos" },
	ojota: { area: "Ojota", fullName: "Ojota, Lagos" },
	ojodu: { area: "Ojodu", fullName: "Ojodu, Lagos" },
	berger: { area: "Berger", fullName: "Berger, Lagos" },
	maryland: { area: "Maryland", fullName: "Maryland, Lagos" },
	gbagada: { area: "Gbagada", fullName: "Gbagada, Lagos" },
	magodo: { area: "Magodo", fullName: "Magodo, Lagos" },
	ketu: { area: "Ketu", fullName: "Ketu, Lagos" },
	"mile 2": { area: "Mile 2", fullName: "Mile 2, Lagos" },
	"mile 12": { area: "Mile 12", fullName: "Mile 12, Lagos" },
	"eko bridge": { area: "Lagos Island", fullName: "Eko Bridge, Lagos" },
	"carter bridge": { area: "Lagos Island", fullName: "Carter Bridge, Lagos" },
	"third mainland": {
		area: "Third Mainland Bridge",
		fullName: "Third Mainland Bridge, Lagos",
	},
	"3rd mainland": {
		area: "Third Mainland Bridge",
		fullName: "Third Mainland Bridge, Lagos",
	},
	"lekki-epe": { area: "Lekki", fullName: "Lekki-Epe Expressway, Lagos" },
	"lekki epe": { area: "Lekki", fullName: "Lekki-Epe Expressway, Lagos" },
	"apapa-oshodi": {
		area: "Apapa",
		fullName: "Apapa-Oshodi Expressway, Lagos",
	},
	"lagos-ibadan": {
		area: "Ojodu",
		fullName: "Lagos-Ibadan Expressway, Lagos",
	},
	"ikorodu road": { area: "Ikorodu", fullName: "Ikorodu Road, Lagos" },
	"lagos island": { area: "Lagos Island", fullName: "Lagos Island, Lagos" },
	mainland: { area: "Lagos Mainland", fullName: "Lagos Mainland, Lagos" },
};

// Keyword groups for incident type detection
const TYPE_KEYWORDS: Record<ReportType, string[]> = {
	flood: [
		"flood",
		"flooding",
		"flooded",
		"waterlogged",
		"water logged",
		"submerged",
		"underwater",
		"rainfall",
		"rain water",
		"drainage",
		"overflow",
		"inundated",
		"heavy rain",
	],
	accident: [
		"accident",
		"crash",
		"collision",
		"knocked",
		"hit",
		"vehicle",
		"truck",
		"tanker",
		"overturned",
		"fallen",
		"injured",
		"fatal",
		"multiple vehicle",
		"pile up",
		"pileup",
	],
	road_blockage: [
		"blocked",
		"blockage",
		"closure",
		"closed",
		"protest",
		"demonstration",
		"construction",
		"diversion",
		"diverted",
		"barricade",
		"roadwork",
		"road work",
		"pothole",
		"broken down",
		"breakdown",
		"abandoned vehicle",
	],
	traffic: [
		"traffic",
		"congestion",
		"go-slow",
		"go slow",
		"gridlock",
		"standstill",
		"bumper to bumper",
		"slow moving",
		"heavy",
		"delay",
		"queue",
		"hold up",
		"holdup",
		"jam",
		"backed up",
	],
};

// Keywords that indicate high severity
const HIGH_SEVERITY_KEYWORDS = [
	"complete",
	"total",
	"severe",
	"major",
	"serious",
	"fatal",
	"death",
	"dead",
	"impassable",
	"completely blocked",
	"all lanes",
	"hours",
	"submerged",
	"deep flood",
	"heavy flooding",
];

// Keywords that indicate low severity
const LOW_SEVERITY_KEYWORDS = [
	"light",
	"minor",
	"slight",
	"little",
	"small",
	"cleared",
	"clear",
	"easing",
	"improving",
	"moving",
	"free flow",
];

// These words must appear for the article to be Lagos-related
const LAGOS_IDENTIFIERS = [
	"lagos",
	"lekki",
	"ikeja",
	"victoria island",
	"ikorodu",
	"surulere",
	"apapa",
	"yaba",
	"oshodi",
	"ajah",
];

// -------------------------------------------------------
// PARSING FUNCTIONS
// -------------------------------------------------------

function normalise(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9\s\-]/g, " ");
}

// Check if text is actually about Lagos
function isLagosRelated(text: string): boolean {
	const lower = text.toLowerCase();
	return LAGOS_IDENTIFIERS.some((word) => lower.includes(word));
}

// Detect incident type from text
function detectType(text: string): ReportType {
	const lower = normalise(text);

	// Order matters — flood and accident are more specific than traffic
	for (const type of [
		"flood",
		"accident",
		"road_blockage",
		"traffic",
	] as ReportType[]) {
		const keywords = TYPE_KEYWORDS[type];
		if (keywords.some((kw) => lower.includes(kw))) {
			return type;
		}
	}

	// Default to traffic — most Lagos incidents are traffic-related
	return "traffic";
}

// Detect severity from text
function detectSeverity(text: string): ReportSeverity {
	const lower = normalise(text);

	if (HIGH_SEVERITY_KEYWORDS.some((kw) => lower.includes(kw))) return "high";
	if (LOW_SEVERITY_KEYWORDS.some((kw) => lower.includes(kw))) return "low";
	return "medium";
}

// Extract the most specific Lagos location from text
function extractLocation(text: string): {
	locationName: string;
	area: string;
} | null {
	const lower = text.toLowerCase();

	// Sort by specificity — longer matches win (e.g. "lekki phase 1" beats "lekki")
	const sortedAreas = Object.entries(LAGOS_AREAS).sort(
		([a], [b]) => b.length - a.length,
	);

	for (const [keyword, location] of sortedAreas) {
		if (lower.includes(keyword)) {
			return {
				locationName: location.fullName,
				area: location.area,
			};
		}
	}

	return null;
	// We skip rather than use a vague "Lagos" location
	// A pin with no specific location is useless on the map
}

// Build a clean user-facing description
function buildDescription(
	type: ReportType,
	area: string,
	text: string,
): string {
	const typeLabels: Record<ReportType, string> = {
		traffic: "Heavy traffic",
		flood: "Flooding reported",
		road_blockage: "Road blockage",
		accident: "Accident reported",
	};

	const base = `${typeLabels[type]} at ${area}`;

	// Try to extract a meaningful sentence from the original text
	const sentences = text.split(/[.!?]+/);
	const relevant = sentences.find(
		(s) => s.toLowerCase().includes(area.toLowerCase()) && s.length > 20,
	);

	if (relevant) {
		const clean = relevant.trim().replace(/\s+/g, " ");
		if (clean.length <= 100) return clean;
		return clean.substring(0, 97) + "...";
	}

	return base;
}

// -------------------------------------------------------
// GEOCODING
// -------------------------------------------------------

// Hardcoded coordinates for common Lagos locations
// Used when no Google Geocoding API key is configured
const LAGOS_COORDINATES: Record<string, { lat: number; lng: number }> = {
	"Lekki, Lagos": { lat: 6.4698, lng: 3.5852 },
	"Lekki Phase 1, Lagos": { lat: 6.4281, lng: 3.4219 },
	"Lekki Phase 2, Lagos": { lat: 6.45, lng: 3.48 },
	"Lekki-Epe Expressway, Lagos": { lat: 6.4698, lng: 3.5852 },
	"Ajah, Lagos": { lat: 6.4675, lng: 3.5814 },
	"Sangotedo, Lagos": { lat: 6.4344, lng: 3.6237 },
	"Victoria Island, Lagos": { lat: 6.4281, lng: 3.4219 },
	"Ikoyi, Lagos": { lat: 6.455, lng: 3.4366 },
	"Ikeja, Lagos": { lat: 6.5958, lng: 3.3358 },
	"Surulere, Lagos": { lat: 6.4969, lng: 3.3481 },
	"Yaba, Lagos": { lat: 6.5095, lng: 3.3711 },
	"Oshodi, Lagos": { lat: 6.5561, lng: 3.35 },
	"Apapa, Lagos": { lat: 6.45, lng: 3.36 },
	"Ikorodu, Lagos": { lat: 6.6194, lng: 3.5106 },
	"Festac Town, Lagos": { lat: 6.4667, lng: 3.2833 },
	"Agege, Lagos": { lat: 6.6167, lng: 3.3167 },
	"Ojota, Lagos": { lat: 6.5833, lng: 3.3833 },
	"Ojodu, Lagos": { lat: 6.6333, lng: 3.35 },
	"Berger, Lagos": { lat: 6.65, lng: 3.3667 },
	"Maryland, Lagos": { lat: 6.5667, lng: 3.35 },
	"Gbagada, Lagos": { lat: 6.55, lng: 3.3833 },
	"Magodo, Lagos": { lat: 6.6, lng: 3.3833 },
	"Ketu, Lagos": { lat: 6.5833, lng: 3.4 },
	"Mile 2, Lagos": { lat: 6.4833, lng: 3.3167 },
	"Mile 12, Lagos": { lat: 6.6, lng: 3.3833 },
	"Third Mainland Bridge, Lagos": { lat: 6.5, lng: 3.3833 },
	"Eko Bridge, Lagos": { lat: 6.4667, lng: 3.3667 },
	"Carter Bridge, Lagos": { lat: 6.4667, lng: 3.35 },
	"Lagos Island, Lagos": { lat: 6.45, lng: 3.3833 },
	"Lagos Mainland, Lagos": { lat: 6.5167, lng: 3.3667 },
	"Ikorodu Road, Lagos": { lat: 6.55, lng: 3.3833 },
	"Apapa-Oshodi Expressway, Lagos": { lat: 6.5, lng: 3.3333 },
	"Lagos-Ibadan Expressway, Lagos": { lat: 6.65, lng: 3.3833 },
};

const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };

export async function geocodeLocation(
	locationName: string,
): Promise<{ lat: number; lng: number; address: string } | null> {
	const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;

	// Try Google Geocoding API if key is available
	if (apiKey) {
		try {
			const query = encodeURIComponent(`${locationName}, Lagos, Nigeria`);
			const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;
			const response = await fetch(url);
			const data = (await response.json()) as {
				status: string;
				results: Array<{
					geometry: { location: { lat: number; lng: number } };
					formatted_address: string;
				}>;
			};

			if (data.status === "OK" && data.results.length > 0) {
				const result = data.results[0];
				return {
					lat: result.geometry.location.lat,
					lng: result.geometry.location.lng,
					address: result.formatted_address,
				};
			}
		} catch (err) {
			logger.warn(
				`Google Geocoding failed for "${locationName}", using fallback`,
				err,
			);
		}
	}

	// Fallback: use hardcoded coordinates
	const coords = LAGOS_COORDINATES[locationName];
	if (coords) {
		logger.debug(`Using hardcoded coordinates for: ${locationName}`);
		return { ...coords, address: locationName };
	}

	// Last resort: Lagos city center
	logger.warn(
		`No coordinates found for "${locationName}" — using Lagos center`,
	);
	return { ...LAGOS_CENTER, address: locationName };
}

// -------------------------------------------------------
// MAIN EXPORT
// -------------------------------------------------------

export async function parseRawReport(
	item: RSSItem,
): Promise<ParsedReport | null> {
	const fullText = `${item.title} ${item.content}`;

	// Step 1: Is this even about Lagos?
	if (!isLagosRelated(fullText)) {
		logger.debug(`Not Lagos-related, skipping: "${item.title}"`);
		return null;
	}

	// Step 2: Extract location — skip if no specific location found
	const location = extractLocation(fullText);
	if (!location) {
		logger.debug(
			`No specific Lagos location found, skipping: "${item.title}"`,
		);
		return null;
	}

	// Step 3: Detect type and severity
	const type = detectType(fullText);
	const severity = detectSeverity(fullText);

	// Step 4: Build clean description
	const description = buildDescription(type, location.area, fullText);

	logger.debug(`Parsed: [${severity}] ${type} at ${location.area}`);

	return {
		isLagosRelated: true,
		type,
		locationName: location.locationName,
		area: location.area,
		description,
		severity,
		confidence: 0.75,
	};
}

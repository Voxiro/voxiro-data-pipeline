// src/processors/deduplicator.ts
// Prevents duplicate reports appearing on the map
// Two reports are duplicates if they're the same type, in the same area, within 1 hour

import { getFirestore, COLLECTIONS } from "../lib/firebase";
import { logger } from "../lib/logger";
import type { ParsedReport } from "../types/report";

// Returns true if a very similar report already exists in Firestore
export async function isDuplicate(
	parsed: ParsedReport,
	lat: number,
	lng: number,
): Promise<boolean> {
	const db = getFirestore();

	// Time window — reports within 1 hour of same type in same area = duplicate
	const oneHourAgo = new Date();
	oneHourAgo.setHours(oneHourAgo.getHours() - 1);

	try {
		const snapshot = await db
			.collection(COLLECTIONS.REPORTS)
			.where("type", "==", parsed.type)
			.where("location.area", "==", parsed.area)
			.where("source", "==", "external")
			.where("isActive", "==", true)
			.where("timestamp", ">=", oneHourAgo)
			.limit(1)
			.get();

		if (!snapshot.empty) {
			logger.debug(
				`Duplicate found: ${parsed.type} in ${parsed.area} already reported`,
			);
			return true;
		}

		return false;
	} catch (err) {
		logger.error("Deduplication check failed", err);
		// If check fails, allow the report through — better to have duplicates than miss incidents
		return false;
	}
}

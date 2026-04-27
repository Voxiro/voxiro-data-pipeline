// src/services/reportsService.ts
// All Firestore read/write operations for reports
// This is the single layer that touches the database

import * as admin from "firebase-admin";
import ngeohash from "ngeohash";
import { getFirestore, COLLECTIONS } from "../lib/firebase";
import { logger } from "../lib/logger";
import type { FirestoreReport, ParsedReport } from "../types/report";

const EXPIRY_HOURS = Number(process.env.REPORT_EXPIRY_HOURS ?? 2.5);

// Saves a new external report to Firestore
export async function saveReport(
	parsed: ParsedReport,
	geocoded: { lat: number; lng: number; formattedAddress: string },
	sourceUrl: string,
	rawText: string,
): Promise<string> {
	const db = getFirestore();

	const now = new Date();
	const expiresAt = new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);

	const report: FirestoreReport = {
		type: parsed.type,
		location: {
			lat: geocoded.lat,
			lng: geocoded.lng,
			address: geocoded.formattedAddress,
			area: parsed.area,
			geohash: ngeohash.encode(geocoded.lat, geocoded.lng, 6),
		},
		description: parsed.description,
		severity: parsed.severity,
		source: "external",
		sourceUrl,
		sourceName: "Google Alerts",
		timestamp: now,
		expiresAt,
		isActive: true,
		confirmations: 0, // starts at 0, users can confirm
		rawText,
		confidence: parsed.confidence,
	};

	const docRef = await db.collection(COLLECTIONS.REPORTS).add({
		...report,
		// Firestore needs server timestamps for real-time queries
		timestamp: admin.firestore.Timestamp.fromDate(now),
		expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
	});

	logger.success(
		`Saved report: [${parsed.severity.toUpperCase()}] ${parsed.type} at ${parsed.area} → ID: ${docRef.id}`,
	);

	return docRef.id;
}

// Marks expired reports as inactive
// Called every 15 minutes — keeps the map clean
export async function expireOldReports(): Promise<number> {
	const db = getFirestore();
	const now = admin.firestore.Timestamp.fromDate(new Date());

	try {
		const snapshot = await db
			.collection(COLLECTIONS.REPORTS)
			.where("isActive", "==", true)
			.where("expiresAt", "<=", now)
			.get();

		if (snapshot.empty) {
			logger.debug("No expired reports to clean up");
			return 0;
		}

		// Batch delete for efficiency (Firestore limit: 500 per batch)
		const batch = db.batch();
		snapshot.docs.forEach((doc) => {
			batch.update(doc.ref, { isActive: false });
		});
		await batch.commit();

		logger.success(`Expired ${snapshot.size} old reports`);
		return snapshot.size;
	} catch (err) {
		logger.error("Failed to expire old reports", err);
		return 0;
	}
}

// Returns active report count — useful to verify pipeline is working
export async function getActiveReportCount(): Promise<number> {
	const db = getFirestore();
	const snapshot = await db
		.collection(COLLECTIONS.REPORTS)
		.where("isActive", "==", true)
		.count()
		.get();
	return snapshot.data().count;
}

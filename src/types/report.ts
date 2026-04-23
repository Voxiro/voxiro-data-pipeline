// src/types/report.ts
// Central type definitions for Area Intel
// These types mirror the Firestore data model exactly

export type ReportType = "traffic" | "flood" | "road_blockage" | "accident";
export type ReportSeverity = "low" | "medium" | "high";
export type ReportSource = "user" | "external";

// Color coding for map pins — matches VC spec (red/orange/yellow)
export const SEVERITY_COLORS: Record<ReportSeverity, string> = {
	high: "#FF3B30", // red
	medium: "#FF9500", // orange
	low: "#FFCC00", // yellow
};

// What Claude API returns after parsing raw text
export interface ParsedReport {
	isLagosRelated: boolean; // discard if false
	type: ReportType;
	locationName: string; // "Lekki Phase 1, Lagos" — we geocode this
	area: string; // "Lekki" — for hyperlocal leaderboards
	description: string; // clean, user-facing description
	severity: ReportSeverity;
	confidence: number; // 0-1, how confident Claude is
}

// Full report shape stored in Firestore
export interface Report {
	id: string;
	type: ReportType;
	location: {
		lat: number;
		lng: number;
		address: string; // full readable address
		area: string; // neighbourhood name e.g. "Lekki"
	};
	description: string;
	severity: ReportSeverity;

	// Source tracking — user vs external shown differently on map
	source: ReportSource;
	sourceUrl?: string; // original article URL
	sourceName?: string; // e.g. "Google Alerts", "LASMA"

	// Media
	image?: string; // Firebase Storage URL

	// Timing — critical for freshness filter (VC requirement)
	timestamp: Date;
	expiresAt: Date; // auto-hide after 2-3 hours
	isActive: boolean;

	// Trust layer (VC requirement)
	confirmations: number; // "+3 people confirmed this"

	// User reports only
	userId?: string;
	userPoints?: number; // points awarded for this report

	// Debug / pipeline
	rawText?: string; // original scraped text
	confidence?: number; // Claude's confidence score
}

// What gets saved to Firestore (Firestore uses its own timestamps)
export type FirestoreReport = Omit<Report, "id">;

// RSS feed item shape
export interface RSSItem {
	title: string;
	content: string;
	link: string;
	pubDate: string;
	source: string;
}

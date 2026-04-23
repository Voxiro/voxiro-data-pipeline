// src/index.ts
// Voxiro Data Pipeline — Main Entry Point
//
// What this does:
//   Every 30 minutes → scrapes Google Alerts RSS feeds
//   → Claude parses raw text into structured reports
//   → Geocodes location names to lat/lng
//   → Deduplicates against existing Firestore data
//   → Saves new reports to Firestore
//   → App map shows live data even before first user signs up
//
// Every 15 minutes → expires old reports (keeps map fresh)

import "dotenv/config";
import cron from "node-cron";
import { initFirebase } from "./lib/firebase";
// import { getAnthropicClient } from './lib/anthropic';
import { fetchGoogleAlerts } from "./scrapers/googleAlerts";
import { parseRawReport } from "./processors/parseReport";
import { geocode } from "./services/geocoder";
import { isDuplicate } from "./processors/deduplicator";
import {
	saveReport,
	expireOldReports,
	getActiveReportCount,
} from "./services/reportsService";
import { logger } from "./lib/logger";

// --- Pipeline Stats (for logging) ---
interface PipelineStats {
	fetched: number;
	parsed: number;
	geocoded: number;
	deduplicated: number;
	saved: number;
	errors: number;
}

// --- Core Pipeline Run ---
async function runPipeline(): Promise<void> {
	logger.pipeline("Voxiro Pipeline Run Starting");

	const stats: PipelineStats = {
		fetched: 0,
		parsed: 0,
		geocoded: 0,
		deduplicated: 0,
		saved: 0,
		errors: 0,
	};

	try {
		// Step 1: Fetch from all external sources
		const items = await fetchGoogleAlerts();
		stats.fetched = items.length;

		if (items.length === 0) {
			logger.info("No new items from any source — pipeline done");
			return;
		}

		logger.info(
			`Processing ${items.length} raw items through AI parser...`,
		);

		// Step 2: Process each item through Claude
		// We do this sequentially to avoid hammering the API
		for (const item of items) {
			try {
				// Parse with Claude
				const parsed = await parseRawReport(item);
				if (!parsed) continue;
				stats.parsed++;

				// Geocode location name → lat/lng
				const geocoded = await geocode(parsed.locationName);
				if (!geocoded) {
					logger.warn(
						`Could not geocode location: ${parsed.locationName}`,
					);
					stats.errors++;
					continue;
				}
				stats.geocoded++;

				// Check for duplicates
				const duplicate = await isDuplicate(
					parsed,
					geocoded.lat,
					geocoded.lng,
				);
				if (duplicate) {
					stats.deduplicated++;
					continue;
				}

				// Save to Firestore
				await saveReport(parsed, geocoded, item.link, item.content);
				stats.saved++;

				// Small delay between API calls — be a good citizen
				await new Promise((r) => setTimeout(r, 500));
			} catch (itemErr) {
				logger.error(`Error processing item: "${item.title}"`, itemErr);
				stats.errors++;
			}
		}

		// Step 3: Log final stats
		const activeCount = await getActiveReportCount();

		logger.pipeline("Pipeline Run Complete");
		logger.info("Stats:", {
			...stats,
			activeReportsOnMap: activeCount,
		});
	} catch (err) {
		logger.error("Pipeline run failed", err);
	}
}

// --- Expiry Job ---
async function runExpiryJob(): Promise<void> {
	logger.debug("Running expiry job...");
	await expireOldReports();
}

// --- Startup ---
async function main(): Promise<void> {
	logger.pipeline("Voxiro Pipeline Starting Up");

	// Initialize connections
	initFirebase();
	// getAnthropicClient();

	// Run once immediately on startup
	await runPipeline();
	await runExpiryJob();

	// Check if --once flag passed (useful for testing)
	if (process.argv.includes("--once")) {
		logger.info("--once flag detected, exiting after single run");
		process.exit(0);
	}

	const scrapeInterval = process.env.SCRAPE_INTERVAL_MINUTES ?? "30";

	// Schedule pipeline every N minutes
	// Cron format: "*/30 * * * *" = every 30 minutes
	cron.schedule(`*/${scrapeInterval} * * * *`, async () => {
		await runPipeline();
	});

	// Schedule expiry check every 15 minutes
	cron.schedule("*/15 * * * *", async () => {
		await runExpiryJob();
	});

	logger.success(
		`Pipeline scheduled — scraping every ${scrapeInterval} mins, expiring every 15 mins`,
	);
	logger.info("Pipeline is running. Press Ctrl+C to stop.\n");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
	logger.info("Shutting down pipeline...");
	process.exit(0);
});

process.on("uncaughtException", (err) => {
	logger.error("Uncaught exception", err);
	process.exit(1);
});

main().catch((err) => {
	logger.error("Startup failed", err);
	process.exit(1);
});

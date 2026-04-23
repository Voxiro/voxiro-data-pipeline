// src/scrapers/googleAlerts.ts
// Fetches and parses Google Alerts RSS feeds for Lagos incident data

import Parser from "rss-parser";
import { getFirestore, COLLECTIONS } from "../lib/firebase";
import { logger } from "../lib/logger";
import type { RSSItem } from "../types/report";

const parser = new Parser({
	timeout: 10000,
	headers: {
		"User-Agent": "Mozilla/5.0 (compatible; AreaIntel/1.0)",
	},
});

// Gets the timestamp of the last time we ran this source
// Stored in Firestore so it persists across restarts
async function getLastRunTime(sourceId: string): Promise<Date> {
	const db = getFirestore();
	const doc = await db
		.collection(COLLECTIONS.PIPELINE_STATE)
		.doc(sourceId)
		.get();

	if (!doc.exists) {
		// First run — look back 3 hours
		const threHoursAgo = new Date();
		threHoursAgo.setHours(threHoursAgo.getHours() - 3);
		return threHoursAgo;
	}

	return doc.data()?.lastRun?.toDate() ?? new Date();
}

// Saves the last run time so we don't re-process old items
async function saveLastRunTime(sourceId: string): Promise<void> {
	const db = getFirestore();
	await db
		.collection(COLLECTIONS.PIPELINE_STATE)
		.doc(sourceId)
		.set({ lastRun: new Date(), sourceId }, { merge: true });
}

// Strips HTML tags from RSS content
function stripHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

// Fetches a single RSS feed and returns new items since last run
async function fetchFeed(url: string, lastRunTime: Date): Promise<RSSItem[]> {
	try {
		logger.debug(`Fetching RSS feed: ${url}`);
		const feed = await parser.parseURL(url);
		const newItems: RSSItem[] = [];

		for (const item of feed.items) {
			const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();

			// Only process items newer than our last run
			if (pubDate <= lastRunTime) continue;

			const rawContent = [
				item.title ?? "",
				item.content ?? "",
				item.contentSnippet ?? "",
			].join(" ");

			newItems.push({
				title: stripHtml(item.title ?? ""),
				content: stripHtml(rawContent),
				link: item.link ?? "",
				pubDate: pubDate.toISOString(),
				source: "Google Alerts",
			});
		}

		logger.debug(`Feed returned ${newItems.length} new items`);
		return newItems;
	} catch (err) {
		logger.error(`Failed to fetch RSS feed: ${url}`, err);
		return []; // Don't crash the whole pipeline for one bad feed
	}
}

// Main export — fetches all configured RSS feeds
export async function fetchGoogleAlerts(): Promise<RSSItem[]> {
	const urlsRaw = process.env.GOOGLE_ALERTS_RSS_URLS ?? "";

	if (!urlsRaw) {
		logger.warn("No GOOGLE_ALERTS_RSS_URLS configured in .env — skipping");
		return [];
	}

	const urls = urlsRaw
		.split(",")
		.map((u) => u.trim())
		.filter(Boolean);

	logger.info(`Fetching ${urls.length} Google Alerts RSS feeds`);

	const sourceId = "google_alerts";
	const lastRunTime = await getLastRunTime(sourceId);

	logger.debug(`Last run: ${lastRunTime.toISOString()}`);

	// Fetch all feeds in parallel
	const results = await Promise.all(
		urls.map((url) => fetchFeed(url, lastRunTime)),
	);

	const allItems = results.flat();

	// Save run time only if we succeeded
	await saveLastRunTime(sourceId);

	logger.success(`Google Alerts: found ${allItems.length} new items`);
	return allItems;
}

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
	// --- Lagos Island & waterfront ---
	"lagos island": { area: "Lagos Island", fullName: "Lagos Island, Lagos" },
	"isale eko": { area: "Lagos Island", fullName: "Isale Eko, Lagos Island, Lagos" },
	idumota: { area: "Lagos Island", fullName: "Idumota, Lagos Island, Lagos" },
	marina: { area: "Lagos Island", fullName: "Marina, Lagos Island, Lagos" },
	onikan: { area: "Onikan", fullName: "Onikan, Lagos Island, Lagos" },
	obalende: { area: "Obalende", fullName: "Obalende, Lagos" },
	"eko bridge": { area: "Lagos Island", fullName: "Eko Bridge, Lagos" },
	"carter bridge": { area: "Lagos Island", fullName: "Carter Bridge, Lagos" },

	// --- Victoria Island / Ikoyi ---
	"victoria island": { area: "Victoria Island", fullName: "Victoria Island, Lagos" },
	" vi ": { area: "Victoria Island", fullName: "Victoria Island, Lagos" },
	"bar beach": { area: "Victoria Island", fullName: "Bar Beach, Victoria Island, Lagos" },
	"eko atlantic": { area: "Eko Atlantic", fullName: "Eko Atlantic City, Lagos" },
	ikoyi: { area: "Ikoyi", fullName: "Ikoyi, Lagos" },
	"banana island": { area: "Banana Island", fullName: "Banana Island, Ikoyi, Lagos" },

	// --- Lekki corridor ---
	"lekki phase 1": { area: "Lekki", fullName: "Lekki Phase 1, Lagos" },
	"lekki phase 2": { area: "Lekki", fullName: "Lekki Phase 2, Lagos" },
	lekki: { area: "Lekki", fullName: "Lekki, Lagos" },
	"lekki-epe": { area: "Lekki", fullName: "Lekki-Epe Expressway, Lagos" },
	"lekki epe": { area: "Lekki", fullName: "Lekki-Epe Expressway, Lagos" },
	"lekki expressway": { area: "Lekki", fullName: "Lekki Expressway, Lagos" },
	chevron: { area: "Lekki", fullName: "Chevron Drive, Lekki, Lagos" },
	vgc: { area: "VGC", fullName: "Victoria Garden City, Lekki, Lagos" },
	"victoria garden city": { area: "VGC", fullName: "Victoria Garden City, Lekki, Lagos" },

	// --- Ajah / Sangotedo / Ibeju ---
	ajah: { area: "Ajah", fullName: "Ajah, Lagos" },
	badore: { area: "Ajah", fullName: "Badore, Ajah, Lagos" },
	"thomas estate": { area: "Ajah", fullName: "Thomas Estate, Ajah, Lagos" },
	"abraham adesanya": { area: "Ajah", fullName: "Abraham Adesanya Estate, Ajah, Lagos" },
	sangotedo: { area: "Sangotedo", fullName: "Sangotedo, Lagos" },
	"ibeju lekki": { area: "Ibeju-Lekki", fullName: "Ibeju-Lekki, Lagos" },
	"ibeju-lekki": { area: "Ibeju-Lekki", fullName: "Ibeju-Lekki, Lagos" },

	// --- Mainland bridges ---
	"third mainland": {
		area: "Third Mainland Bridge",
		fullName: "Third Mainland Bridge, Lagos",
	},
	"3rd mainland": {
		area: "Third Mainland Bridge",
		fullName: "Third Mainland Bridge, Lagos",
	},
	mainland: { area: "Lagos Mainland", fullName: "Lagos Mainland, Lagos" },

	// --- Yaba / Surulere ---
	yaba: { area: "Yaba", fullName: "Yaba, Lagos" },
	surulere: { area: "Surulere", fullName: "Surulere, Lagos" },
	ojuelegba: { area: "Ojuelegba", fullName: "Ojuelegba, Lagos" },
	"bode thomas": { area: "Surulere", fullName: "Bode Thomas, Surulere, Lagos" },
	itire: { area: "Surulere", fullName: "Itire, Surulere, Lagos" },

	// --- Apapa / port ---
	apapa: { area: "Apapa", fullName: "Apapa, Lagos" },
	"apapa-oshodi": { area: "Apapa", fullName: "Apapa-Oshodi Expressway, Lagos" },
	ijora: { area: "Ijora", fullName: "Ijora, Lagos" },
	ajegunle: { area: "Ajegunle", fullName: "Ajegunle, Lagos" },
	orile: { area: "Orile", fullName: "Orile Iganmu, Lagos" },

	// --- Festac / Amuwo-Odofin / Mile 2 ---
	festac: { area: "Festac", fullName: "Festac Town, Lagos" },
	"mile 2": { area: "Mile 2", fullName: "Mile 2, Lagos" },
	"amuwo odofin": { area: "Amuwo Odofin", fullName: "Amuwo-Odofin, Lagos" },
	"amuwo-odofin": { area: "Amuwo Odofin", fullName: "Amuwo-Odofin, Lagos" },
	"satellite town": { area: "Satellite Town", fullName: "Satellite Town, Lagos" },
	"trade fair": { area: "Trade Fair", fullName: "Trade Fair Complex, Lagos" },

	// --- Badagry corridor ---
	badagry: { area: "Badagry", fullName: "Badagry, Lagos" },
	"badagry express": { area: "Badagry", fullName: "Lagos-Badagry Expressway, Lagos" },
	"badagry expressway": { area: "Badagry", fullName: "Lagos-Badagry Expressway, Lagos" },

	// --- Mushin / Oshodi / Isolo ---
	mushin: { area: "Mushin", fullName: "Mushin, Lagos" },
	oshodi: { area: "Oshodi", fullName: "Oshodi, Lagos" },
	isolo: { area: "Isolo", fullName: "Isolo, Lagos" },
	ejigbo: { area: "Ejigbo", fullName: "Ejigbo, Lagos" },
	ilasamaja: { area: "Isolo", fullName: "Ilasamaja, Isolo, Lagos" },
	okota: { area: "Isolo", fullName: "Okota, Lagos" },

	// --- Somolu / Bariga ---
	bariga: { area: "Bariga", fullName: "Bariga, Lagos" },
	somolu: { area: "Somolu", fullName: "Somolu, Lagos" },
	fadeyi: { area: "Fadeyi", fullName: "Fadeyi, Lagos" },
	palmgroove: { area: "Palm Grove", fullName: "Palm Grove, Lagos" },
	"palm grove": { area: "Palm Grove", fullName: "Palm Grove, Lagos" },

	// --- Maryland / Anthony / Mende ---
	maryland: { area: "Maryland", fullName: "Maryland, Lagos" },
	mende: { area: "Mende", fullName: "Mende, Maryland, Lagos" },
	"anthony village": { area: "Anthony", fullName: "Anthony Village, Lagos" },
	anthony: { area: "Anthony", fullName: "Anthony Village, Lagos" },

	// --- Gbagada / Ogudu / Kosofe ---
	gbagada: { area: "Gbagada", fullName: "Gbagada, Lagos" },
	ogudu: { area: "Ogudu", fullName: "Ogudu, Lagos" },
	alapere: { area: "Alapere", fullName: "Alapere, Lagos" },
	oworonshoki: { area: "Oworonshoki", fullName: "Oworonshoki, Lagos" },
	oworo: { area: "Oworonshoki", fullName: "Oworonshoki, Lagos" },

	// --- Ketu / Ojota / Mile 12 ---
	ketu: { area: "Ketu", fullName: "Ketu, Lagos" },
	ojota: { area: "Ojota", fullName: "Ojota, Lagos" },
	"mile 12": { area: "Mile 12", fullName: "Mile 12, Lagos" },

	// --- Magodo / Ojodu / Berger ---
	magodo: { area: "Magodo", fullName: "Magodo, Lagos" },
	ojodu: { area: "Ojodu", fullName: "Ojodu, Lagos" },
	berger: { area: "Berger", fullName: "Berger, Lagos" },

	// --- Ikeja & GRA / Oregun / Alausa / Agidingbi ---
	ikeja: { area: "Ikeja", fullName: "Ikeja, Lagos" },
	oregun: { area: "Oregun", fullName: "Oregun, Ikeja, Lagos" },
	alausa: { area: "Alausa", fullName: "Alausa, Ikeja, Lagos" },
	agidingbi: { area: "Agidingbi", fullName: "Agidingbi, Ikeja, Lagos" },

	// --- Agege / Ogba / Dopemu ---
	agege: { area: "Agege", fullName: "Agege, Lagos" },
	ogba: { area: "Ogba", fullName: "Ogba, Lagos" },
	dopemu: { area: "Dopemu", fullName: "Dopemu, Agege, Lagos" },

	// --- Ifako-Ijaiye / Abule Egba / Ipaja ---
	"ifako-ijaiye": { area: "Ifako-Ijaiye", fullName: "Ifako-Ijaiye, Lagos" },
	ifako: { area: "Ifako-Ijaiye", fullName: "Ifako-Ijaiye, Lagos" },
	"abule egba": { area: "Abule Egba", fullName: "Abule Egba, Lagos" },
	ipaja: { area: "Ipaja", fullName: "Ipaja, Lagos" },

	// --- Alimosho / West Lagos ---
	alimosho: { area: "Alimosho", fullName: "Alimosho, Lagos" },
	igando: { area: "Igando", fullName: "Igando, Lagos" },
	ikotun: { area: "Ikotun", fullName: "Ikotun, Lagos" },
	idimu: { area: "Idimu", fullName: "Idimu, Lagos" },
	egbeda: { area: "Egbeda", fullName: "Egbeda, Lagos" },
	egbe: { area: "Egbe", fullName: "Egbe, Lagos" },
	akowonjo: { area: "Akowonjo", fullName: "Akowonjo, Lagos" },

	// --- Ikorodu & surroundings ---
	ikorodu: { area: "Ikorodu", fullName: "Ikorodu, Lagos" },
	"ikorodu road": { area: "Ikorodu", fullName: "Ikorodu Road, Lagos" },
	owutu: { area: "Ikorodu", fullName: "Owutu, Ikorodu, Lagos" },
	imota: { area: "Ikorodu", fullName: "Imota, Lagos" },

	// --- Epe ---
	epe: { area: "Epe", fullName: "Epe, Lagos" },

	// --- Expressways ---
	"lagos-ibadan": { area: "Ojodu", fullName: "Lagos-Ibadan Expressway, Lagos" },
	"lagos-abeokuta": { area: "Agege", fullName: "Lagos-Abeokuta Expressway, Lagos" },
	"lagos abeokuta": { area: "Agege", fullName: "Lagos-Abeokuta Expressway, Lagos" },
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
	// Lagos Island & waterfront
	"Lagos Island, Lagos": { lat: 6.4500, lng: 3.4000 },
	"Isale Eko, Lagos Island, Lagos": { lat: 6.4573, lng: 3.3798 },
	"Idumota, Lagos Island, Lagos": { lat: 6.4565, lng: 3.3852 },
	"Marina, Lagos Island, Lagos": { lat: 6.4491, lng: 3.3924 },
	"Onikan, Lagos Island, Lagos": { lat: 6.4554, lng: 3.4006 },
	"Obalende, Lagos": { lat: 6.4538, lng: 3.4060 },
	"Eko Bridge, Lagos": { lat: 6.4667, lng: 3.3667 },
	"Carter Bridge, Lagos": { lat: 6.4667, lng: 3.3500 },

	// Victoria Island / Ikoyi
	"Victoria Island, Lagos": { lat: 6.4281, lng: 3.4219 },
	"Bar Beach, Victoria Island, Lagos": { lat: 6.4263, lng: 3.4244 },
	"Eko Atlantic City, Lagos": { lat: 6.4191, lng: 3.4072 },
	"Ikoyi, Lagos": { lat: 6.4550, lng: 3.4366 },
	"Banana Island, Ikoyi, Lagos": { lat: 6.4638, lng: 3.4423 },

	// Lekki corridor
	"Lekki Phase 1, Lagos": { lat: 6.4439, lng: 3.4751 }, // verified via distancesto.com & coordinatesfinder.com
	"Lekki Phase 2, Lagos": { lat: 6.4503, lng: 3.5095 },
	"Lekki, Lagos": { lat: 6.4355, lng: 3.5218 },
	"Lekki-Epe Expressway, Lagos": { lat: 6.4355, lng: 3.5218 },
	"Lekki Expressway, Lagos": { lat: 6.4418, lng: 3.5040 },
	"Chevron Drive, Lekki, Lagos": { lat: 6.4386, lng: 3.5189 },
	"Victoria Garden City, Lekki, Lagos": { lat: 6.4526, lng: 3.5372 },

	// Ajah / Sangotedo / Ibeju
	"Ajah, Lagos": { lat: 6.4675, lng: 3.5814 },
	"Badore, Ajah, Lagos": { lat: 6.4630, lng: 3.5938 },
	"Thomas Estate, Ajah, Lagos": { lat: 6.4629, lng: 3.5913 },
	"Abraham Adesanya Estate, Ajah, Lagos": { lat: 6.4668, lng: 3.5981 },
	"Sangotedo, Lagos": { lat: 6.4344, lng: 3.6237 },
	"Ibeju-Lekki, Lagos": { lat: 6.4773, lng: 3.7126 },

	// Mainland bridges
	"Third Mainland Bridge, Lagos": { lat: 6.5000, lng: 3.3833 },
	"Lagos Mainland, Lagos": { lat: 6.5167, lng: 3.3667 },

	// Yaba / Surulere
	"Yaba, Lagos": { lat: 6.5095, lng: 3.3711 },
	"Surulere, Lagos": { lat: 6.4969, lng: 3.3481 },
	"Ojuelegba, Lagos": { lat: 6.5053, lng: 3.3590 },
	"Bode Thomas, Surulere, Lagos": { lat: 6.4980, lng: 3.3522 },
	"Itire, Surulere, Lagos": { lat: 6.4975, lng: 3.3490 },

	// Apapa / port
	"Apapa, Lagos": { lat: 6.4500, lng: 3.3600 },
	"Apapa-Oshodi Expressway, Lagos": { lat: 6.5000, lng: 3.3333 },
	"Ijora, Lagos": { lat: 6.4625, lng: 3.3608 },
	"Ajegunle, Lagos": { lat: 6.4520, lng: 3.3312 }, // verified via geodatos.net
	"Orile Iganmu, Lagos": { lat: 6.4847, lng: 3.3322 },

	// Festac / Amuwo-Odofin / Mile 2
	"Festac Town, Lagos": { lat: 6.4667, lng: 3.2833 },
	"Mile 2, Lagos": { lat: 6.4833, lng: 3.3167 },
	"Amuwo-Odofin, Lagos": { lat: 6.4293, lng: 3.2684 }, // verified via geocords.com
	"Satellite Town, Lagos": { lat: 6.4300, lng: 3.2700 },
	"Trade Fair Complex, Lagos": { lat: 6.4740, lng: 3.2832 },

	// Badagry corridor
	"Badagry, Lagos": { lat: 6.4150, lng: 2.8813 }, // verified via latitude.to
	"Lagos-Badagry Expressway, Lagos": { lat: 6.4547, lng: 3.2167 },

	// Mushin / Oshodi / Isolo
	"Mushin, Lagos": { lat: 6.5333, lng: 3.3500 }, // verified via latitude.to
	"Oshodi, Lagos": { lat: 6.5561, lng: 3.3500 },
	"Isolo, Lagos": { lat: 6.5276, lng: 3.3122 },
	"Ejigbo, Lagos": { lat: 6.5520, lng: 3.3070 }, // verified via latitude.to
	"Ilasamaja, Isolo, Lagos": { lat: 6.4974, lng: 3.3196 },
	"Okota, Lagos": { lat: 6.5057, lng: 3.3168 },

	// Somolu / Bariga
	"Bariga, Lagos": { lat: 6.5336, lng: 3.3891 },
	"Somolu, Lagos": { lat: 6.5258, lng: 3.3754 },
	"Fadeyi, Lagos": { lat: 6.5200, lng: 3.3690 },
	"Palm Grove, Lagos": { lat: 6.5244, lng: 3.3640 },

	// Maryland / Anthony / Mende
	"Maryland, Lagos": { lat: 6.5667, lng: 3.3500 },
	"Mende, Maryland, Lagos": { lat: 6.5462, lng: 3.3627 },
	"Anthony Village, Lagos": { lat: 6.5577, lng: 3.3700 },

	// Gbagada / Ogudu / Kosofe
	"Gbagada, Lagos": { lat: 6.5500, lng: 3.3833 },
	"Ogudu, Lagos": { lat: 6.5693, lng: 3.3875 },
	"Alapere, Lagos": { lat: 6.5839, lng: 3.3820 },
	"Oworonshoki, Lagos": { lat: 6.5493, lng: 3.3912 },

	// Ketu / Ojota / Mile 12
	"Ketu, Lagos": { lat: 6.5833, lng: 3.4000 },
	"Ojota, Lagos": { lat: 6.5833, lng: 3.3833 },
	"Mile 12, Lagos": { lat: 6.6000, lng: 3.3833 },

	// Magodo / Ojodu / Berger
	"Magodo, Lagos": { lat: 6.6000, lng: 3.3833 },
	"Ojodu, Lagos": { lat: 6.6333, lng: 3.3500 },
	"Berger, Lagos": { lat: 6.6500, lng: 3.3667 },

	// Ikeja & GRA / Oregun / Alausa / Agidingbi
	"Ikeja, Lagos": { lat: 6.5958, lng: 3.3358 },
	"Oregun, Ikeja, Lagos": { lat: 6.5937, lng: 3.3542 },
	"Alausa, Ikeja, Lagos": { lat: 6.5990, lng: 3.3509 },
	"Agidingbi, Ikeja, Lagos": { lat: 6.6052, lng: 3.3523 },

	// Agege / Ogba / Dopemu
	"Agege, Lagos": { lat: 6.6167, lng: 3.3167 },
	"Ogba, Lagos": { lat: 6.6136, lng: 3.3267 },
	"Dopemu, Agege, Lagos": { lat: 6.5709, lng: 3.2866 },

	// Ifako-Ijaiye / Abule Egba / Ipaja
	"Ifako-Ijaiye, Lagos": { lat: 6.6416, lng: 3.2944 },
	"Abule Egba, Lagos": { lat: 6.6154, lng: 3.2620 },
	"Ipaja, Lagos": { lat: 6.5836, lng: 3.2541 },

	// Alimosho / West Lagos
	"Alimosho, Lagos": { lat: 6.5688, lng: 3.2522 },
	"Igando, Lagos": { lat: 6.5250, lng: 3.2610 },
	"Ikotun, Lagos": { lat: 6.5488, lng: 3.2695 }, // verified via Wikipedia
	"Idimu, Lagos": { lat: 6.5222, lng: 3.2748 },
	"Egbeda, Lagos": { lat: 6.5560, lng: 3.2698 },
	"Egbe, Lagos": { lat: 6.5172, lng: 3.2652 },
	"Akowonjo, Lagos": { lat: 6.5572, lng: 3.2858 },

	// Ikorodu & surroundings
	"Ikorodu, Lagos": { lat: 6.6194, lng: 3.5106 },
	"Ikorodu Road, Lagos": { lat: 6.5500, lng: 3.3833 },
	"Owutu, Ikorodu, Lagos": { lat: 6.6341, lng: 3.5083 },
	"Imota, Lagos": { lat: 6.6597, lng: 3.5337 },

	// Epe
	"Epe, Lagos": { lat: 6.5833, lng: 3.9833 }, // verified via latitude.to

	// Expressways
	"Lagos-Ibadan Expressway, Lagos": { lat: 6.6500, lng: 3.3833 },
	"Lagos-Abeokuta Expressway, Lagos": { lat: 6.6178, lng: 3.2817 },
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

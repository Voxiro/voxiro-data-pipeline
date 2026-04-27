"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReportCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const ngeohash_1 = __importDefault(require("ngeohash"));
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
const NOTIFY_RADIUS_KM = 1.0;
const STALE_TOKEN_DAYS = 7;
const TYPE_LABEL = {
    flood: "Flooding",
    traffic: "Heavy traffic",
    accident: "Accident",
    road_blockage: "Road blocked",
};
exports.onReportCreated = (0, firestore_1.onDocumentCreated)("reports/{reportId}", async (event) => {
    var _a, _b, _c, _d;
    const report = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!(report === null || report === void 0 ? void 0 : report.isActive))
        return;
    const { lat, lng, geohash, area } = (_b = report.location) !== null && _b !== void 0 ? _b : {};
    if (!lat || !lng || !geohash) {
        console.warn(`Report ${event.params.reportId} missing location — skipping`);
        return;
    }
    const type = (_c = report.type) !== null && _c !== void 0 ? _c : "traffic";
    const label = (_d = TYPE_LABEL[type]) !== null && _d !== void 0 ? _d : "Incident";
    // 1. Target cell + 8 neighbours — covers ~3.6 km × 1.8 km bounding box
    const cells = [geohash, ...ngeohash_1.default.neighbors(geohash)];
    // 2. Query user_tokens — one range query per cell, all in parallel
    const cutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() - STALE_TOKEN_DAYS * 24 * 60 * 60 * 1000));
    const snapshots = await Promise.all(cells.map((cell) => db
        .collection("user_tokens")
        .where("geohash", ">=", cell)
        .where("geohash", "<", cell + "~")
        .where("updatedAt", ">", cutoff)
        .get()));
    // 3. Deduplicate by userId (a user near a cell boundary appears in 2+ results)
    const seen = new Set();
    const candidates = [];
    for (const snap of snapshots) {
        for (const doc of snap.docs) {
            const d = doc.data();
            if (d.userId && !seen.has(d.userId) && d.fcmToken && d.lat && d.lng) {
                seen.add(d.userId);
                candidates.push({ token: d.fcmToken, lat: d.lat, lng: d.lng });
            }
        }
    }
    // 4. Haversine filter — keep only users truly within NOTIFY_RADIUS_KM
    const nearby = candidates.filter((u) => haversineKm(lat, lng, u.lat, u.lng) <= NOTIFY_RADIUS_KM);
    if (nearby.length === 0) {
        console.log(`No users within ${NOTIFY_RADIUS_KM}km of report ${event.params.reportId}`);
        return;
    }
    console.log(`Sending notifications to ${nearby.length} user(s) near ${area}`);
    // 5. Build FCM messages
    const messages = nearby.map(({ token, lat: uLat, lng: uLng }) => {
        const distKm = haversineKm(lat, lng, uLat, uLng);
        const distText = distKm < 0.1 ? "nearby" : `${distKm.toFixed(1)}km away`;
        return {
            token,
            notification: {
                title: `${label} in ${area}`,
                body: `${label} reported ${distText} from your location.`,
            },
            data: {
                reportId: event.params.reportId,
                type,
                area,
                lat: String(lat),
                lng: String(lng),
            },
            android: {
                priority: "high",
                notification: { channelId: "voxiro_alerts" },
            },
            apns: {
                payload: { aps: { sound: "default", badge: 1 } },
            },
        };
    });
    // 6. Send in batches of 500 (FCM limit)
    let successCount = 0;
    let failureCount = 0;
    for (const batch of chunk(messages, 500)) {
        const result = await messaging.sendEach(batch);
        successCount += result.successCount;
        failureCount += result.failureCount;
        // Log any individual failures for debugging
        result.responses.forEach((resp, i) => {
            var _a;
            if (!resp.success) {
                console.warn(`FCM send failed for token ${batch[i].token}: ${(_a = resp.error) === null || _a === void 0 ? void 0 : _a.message}`);
            }
        });
    }
    console.log(`Report ${event.params.reportId}: sent ${successCount} notifications, ${failureCount} failed`);
});
// --- Helpers ---
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg) {
    return (deg * Math.PI) / 180;
}
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}
//# sourceMappingURL=index.js.map
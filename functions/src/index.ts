import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import ngeohash from "ngeohash";

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

const NOTIFY_RADIUS_KM = 1.0;
const STALE_TOKEN_DAYS = 7;

const TYPE_LABEL: Record<string, string> = {
  flood: "Flooding",
  traffic: "Heavy traffic",
  accident: "Accident",
  road_blockage: "Road blocked",
};

export const onReportCreated = onDocumentCreated(
  "reports/{reportId}",
  async (event) => {
    const report = event.data?.data();
    if (!report?.isActive) return;

    const { lat, lng, geohash, area } = report.location ?? {};
    if (!lat || !lng || !geohash) {
      console.warn(`Report ${event.params.reportId} missing location — skipping`);
      return;
    }

    const type: string = report.type ?? "traffic";
    const label = TYPE_LABEL[type] ?? "Incident";

    // 1. Target cell + 8 neighbours — covers ~3.6 km × 1.8 km bounding box
    const cells = [geohash, ...ngeohash.neighbors(geohash)];

    // 2. Query user_tokens — one range query per cell, all in parallel
    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - STALE_TOKEN_DAYS * 24 * 60 * 60 * 1000)
    );

    const snapshots = await Promise.all(
      cells.map((cell) =>
        db
          .collection("user_tokens")
          .where("geohash", ">=", cell)
          .where("geohash", "<", cell + "~")
          .where("updatedAt", ">", cutoff)
          .get()
      )
    );

    // 3. Deduplicate by userId (a user near a cell boundary appears in 2+ results)
    const seen = new Set<string>();
    const candidates: { token: string; lat: number; lng: number }[] = [];

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
    const nearby = candidates.filter(
      (u) => haversineKm(lat, lng, u.lat, u.lng) <= NOTIFY_RADIUS_KM
    );

    if (nearby.length === 0) {
      console.log(`No users within ${NOTIFY_RADIUS_KM}km of report ${event.params.reportId}`);
      return;
    }

    console.log(`Sending notifications to ${nearby.length} user(s) near ${area}`);

    // 5. Build FCM messages
    const messages: admin.messaging.TokenMessage[] = nearby.map(({ token, lat: uLat, lng: uLng }) => {
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
          priority: "high" as const,
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
        if (!resp.success) {
          console.warn(`FCM send failed for token ${batch[i].token}: ${resp.error?.message}`);
        }
      });
    }

    console.log(
      `Report ${event.params.reportId}: sent ${successCount} notifications, ${failureCount} failed`
    );
  }
);

// --- Helpers ---

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

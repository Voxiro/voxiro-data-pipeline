# Voxiro — Push Notification Geofencing Plan

**Goal:** When a new report is saved (flood, accident, etc.), send a push notification
to every user within ~1 km of the incident. Message format: *"Flood reported 0.8km from you."*

**Approach:** Geohashing + Firestore + Firebase Cloud Functions + FCM.
Zero extra infrastructure beyond what Firebase already provides.

---

## How It Works (Bird's Eye)

```
Pipeline saves report
       │
       ▼
Firestore `reports/{id}` onCreate
       │
       ▼
Cloud Function triggers
  1. Read report's geohash (precision 6, ~1.2km cells)
  2. Get 9 cells: target cell + 8 neighbours
  3. Query `user_tokens` where geohash ∈ those 9 cells
  4. Filter results: haversine distance ≤ 1 km (removes edge false-positives)
  5. Send FCM batch notification to surviving tokens
```

---

## Geohash Primer (Why Precision 6)

A geohash encodes a lat/lng into a short string. Each character halves the precision:

| Precision | Cell size         |
|-----------|-------------------|
| 5         | ~4.9 km × 4.9 km  |
| **6**     | **~1.2 km × 0.6 km** ← we use this |
| 7         | ~152 m × 152 m    |

At precision 6, querying the target cell + 8 neighbours covers a ~3.6 km × 1.8 km bounding
box. The haversine post-filter trims it to the true 1 km circle.

---

## Data Model Changes

### `reports/{reportId}` — add one field

```ts
geohash: string   // e.g. "s17m5q"  — precision 6, encoded from lat/lng
```

### New collection: `user_tokens/{userId}`

```ts
{
  userId:     string,    // Firebase Auth UID
  fcmToken:   string,    // FCM registration token
  geohash:    string,    // precision 6, user's last known location
  lat:        number,    // stored for haversine check
  lng:        number,
  updatedAt:  Timestamp
}
```

---

## Firestore Indexes Required

| Collection    | Fields indexed        | Purpose                          |
|---------------|-----------------------|----------------------------------|
| `user_tokens` | `geohash` (ASC)       | Range query on geohash prefix    |
| `user_tokens` | `updatedAt` (DESC)    | Skip stale tokens (>7 days old)  |

The geohash range query uses Firestore's string prefix range:
`where("geohash", ">=", cell).where("geohash", "<", cell + "~")`
Run this as 9 parallel queries (one per cell) and merge results.

---

## Pieces to Build

### A — Pipeline (this repo)

**A1. Install `ngeohash`**
```bash
npm install ngeohash
npm install --save-dev @types/ngeohash
```

**A2. Add `geohash` to `Report` type** (`src/types/report.ts`)
Add `geohash: string` to the `location` object inside `Report` and `FirestoreReport`.

**A3. Encode geohash on save** (`src/services/reportsService.ts`)
```ts
import ngeohash from "ngeohash";
// inside saveReport(), after geocoding:
const geohash = ngeohash.encode(geocoded.lat, geocoded.lng, 6);
// add to report.location: { ...existing fields, geohash }
```

---

### B — Cloud Function (new: `functions/` in this repo)

**B1. Scaffold the Cloud Functions project**
```
functions/
  src/
    index.ts          ← the function lives here
  package.json
  tsconfig.json
```

**B2. Install dependencies**
```bash
cd functions
npm install firebase-functions firebase-admin ngeohash
npm install --save-dev typescript @types/node @types/ngeohash
```

**B3. Write `onReportCreated`** (`functions/src/index.ts`)

Full logic:
```ts
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import ngeohash from "ngeohash";

admin.initializeApp();

export const onReportCreated = onDocumentCreated(
  "reports/{reportId}",
  async (event) => {
    const report = event.data?.data();
    if (!report?.location?.geohash || !report.isActive) return;

    const { geohash, lat, lng, area } = report.location;
    const type: string = report.type;

    // 1. Get target cell + 8 neighbours
    const cells = [geohash, ...ngeohash.neighbors(geohash)];

    // 2. Query user_tokens — 9 parallel range queries
    const db = admin.firestore();
    const snapshots = await Promise.all(
      cells.map((cell) =>
        db
          .collection("user_tokens")
          .where("geohash", ">=", cell)
          .where("geohash", "<", cell + "~")
          .where("updatedAt", ">", sevenDaysAgo())
          .get()
      )
    );

    // 3. Deduplicate tokens (user may appear in multiple cells)
    const seen = new Set<string>();
    const tokens: { token: string; uLat: number; uLng: number }[] = [];
    for (const snap of snapshots) {
      for (const doc of snap.docs) {
        const d = doc.data();
        if (!seen.has(d.userId)) {
          seen.add(d.userId);
          tokens.push({ token: d.fcmToken, uLat: d.lat, uLng: d.lng });
        }
      }
    }

    // 4. Haversine filter — keep only users truly within 1 km
    const nearby = tokens.filter(
      ({ uLat, uLng }) => haversineKm(lat, lng, uLat, uLng) <= 1.0
    );
    if (nearby.length === 0) return;

    // 5. Build notification
    const typeLabel: Record<string, string> = {
      flood: "Flooding",
      traffic: "Heavy traffic",
      accident: "Accident",
      road_blockage: "Road blocked",
    };
    const label = typeLabel[type] ?? "Incident";

    // 6. Send FCM batch (max 500 per call)
    const messages = nearby.map(({ token, uLat, uLng }) => ({
      token,
      notification: {
        title: `${label} near you`,
        body: `${label} reported ${haversineKm(lat, lng, uLat, uLng).toFixed(1)}km from you in ${area}.`,
      },
      data: { reportId: event.params.reportId, type, area },
      android: { priority: "high" as const },
      apns: { payload: { aps: { sound: "default" } } },
    }));

    const batches = chunk(messages, 500);
    for (const batch of batches) {
      await admin.messaging().sendEach(batch);
    }
  }
);

// --- Helpers ---

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function sevenDaysAgo() {
  return admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
```

---

### C — Firestore Setup (Firebase Console)

**C1. Add composite indexes** for `user_tokens`:
- `geohash` ASC
- `updatedAt` DESC

**C2. Firestore security rules** — `user_tokens` should only be
writable by the authenticated owner:
```
match /user_tokens/{userId} {
  allow read: if false;                          // only Cloud Functions read this
  allow write: if request.auth.uid == userId;    // only the owner writes their token
}
```

**C3. Enable Cloud Messaging** in Firebase Console → Project Settings → Cloud Messaging.

---

### D — App (React Native / Expo — separate repo)

**D1. Install dependencies**
```bash
npx expo install expo-notifications expo-location
npm install ngeohash firebase
```

**D2. Request permissions on app start**
```ts
await Notifications.requestPermissionsAsync();
await Location.requestForegroundPermissionsAsync();
```

**D3. Get FCM token**
```ts
const token = (await Notifications.getExpoPushTokenAsync()).data;
// or for raw FCM: Notifications.getDevicePushTokenAsync()
```

**D4. Save token + geohash to Firestore** (call on app open and on significant location change)
```ts
import ngeohash from "ngeohash";

async function updateUserToken(userId: string) {
  const location = await Location.getCurrentPositionAsync({});
  const { latitude: lat, longitude: lng } = location.coords;
  await setDoc(doc(db, "user_tokens", userId), {
    userId,
    fcmToken: token,
    geohash: ngeohash.encode(lat, lng, 6),
    lat,
    lng,
    updatedAt: serverTimestamp(),
  });
}
```

**D5. Handle incoming notifications** (foreground + background)
```ts
Notifications.addNotificationReceivedListener(notification => {
  // show in-app banner or navigate to report on map
});
```

---

### E — Deploy & Test

**E1. Deploy Cloud Function**
```bash
cd functions && npm run build
firebase deploy --only functions
```

**E2. Smoke test**
- Run pipeline (`npm run dev -- --once`)
- Confirm report appears in Firestore with a `location.geohash` field
- Check Firebase Functions logs for the `onReportCreated` execution
- Confirm notification arrives on a test device within ~5 seconds

**E3. Radius test**
- Save a mock report at a known coordinate
- Register a test token with a coordinate exactly 0.9 km away → should notify
- Register a test token with a coordinate exactly 1.1 km away → should NOT notify

---

## What You Do vs What I Do

| # | Task | Who |
|---|------|-----|
| A1–A3 | Pipeline changes (geohash on reports) | Me (Claude) |
| B1–B3 | Cloud Function scaffold + full implementation | Me (Claude) |
| C1 | Add Firestore indexes in Firebase Console | You |
| C2 | Update Firestore security rules | Me (Claude) drafts, You deploys |
| C3 | Enable Cloud Messaging in Firebase Console | You |
| D1–D5 | App-side token + geohash registration | You (app repo) |
| E1 | Deploy Cloud Function | You (`firebase deploy`) |
| E2–E3 | Test end-to-end | Both |

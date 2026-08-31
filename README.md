# Voxiro — Data Pipeline

Automatically populates the Voxiro map with Lagos traffic, flood, and road incident data from external sources. Solves the cold start problem — your map has live data before a single user signs up.

## How It Works

```
Every 30 minutes:
  Google Alerts RSS feeds
        ↓
  Keyword parser → incident type, severity, location name
        ↓
  4-layer geocoder → lat/lng
  (memory cache → 90+ hardcoded Lagos areas → Firestore cache → Google API)
        ↓
  Deduplication check
        ↓
  Firestore (reports collection)
        ↓
  Voxiro map shows live pins
```

---

## Setup (do this once, ~30 minutes)

### 1. Clone and install

```bash
git clone <your-repo>
cd voxiro-pipeline
npm install
```

### 2. Set up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create project → name it `voxiro`
3. Go to **Firestore Database** → **Create Database** → Production mode → `europe-west1` region
4. Go to **Project Settings** → **Service Accounts** → **Generate New Private Key**
5. Save the downloaded JSON as `serviceAccountKey.json` in the project root
6. **Never commit this file** (it's already in .gitignore)

### 3. Set up Google Alerts RSS feeds

Go to [google.com/alerts](https://google.com/alerts) and create alerts for:

| Search Term | Delivery |
|---|---|
| `Lagos traffic jam` | RSS Feed |
| `Lagos flood` | RSS Feed |
| `Lagos road closed` | RSS Feed |
| `Lagos accident` | RSS Feed |
| `Lekki traffic` | RSS Feed |
| `Third Mainland Bridge` | RSS Feed |

For each: **Show Options** → **Deliver to: RSS Feed** → **Create Alert**

Copy each RSS URL (looks like `https://www.google.com/alerts/feeds/XXXXX/XXXXX`)

### 4. Set up Google Geocoding API (optional)

The pipeline has 90+ hardcoded Lagos locations and a Firestore persistent cache, so the Google Geocoding API is only called for locations not already known. For MVP this is optional — add the key when you start seeing reports fall back to the Lagos city centre coordinates (`6.5244, 3.3792`).

If you want to set it up:
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → select your Firebase project
2. Enable **Geocoding API**
3. Go to **Credentials** → **Create API Key** → restrict it to Geocoding API only
4. Set a daily quota cap (e.g. 500 requests/day) to prevent runaway billing
5. Copy the key

> **Cost**: Free tier covers 10,000 requests/month. With caching, typical usage is well under 100/month.

### 5. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
FIREBASE_PROJECT_ID=voxiro-app   # dev. Local runs should target dev, never voxiro-prod.
GOOGLE_ALERTS_RSS_URLS=https://www.google.com/alerts/feeds/URL1,https://www.google.com/alerts/feeds/URL2
GOOGLE_GEOCODING_API_KEY=AIza...   # optional — see Step 4
SCRAPE_INTERVAL_MINUTES=30
DEBUG=true
```

---

## Running the Pipeline

### Development (run once and exit)
```bash
npm run dev -- --once
```

### Development (run continuously with cron)
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

---

## Firestore Data Model

Every report in the `reports` collection:

```json
{
  "id": "auto-generated",
  "type": "traffic | flood | road_blockage | accident",
  "location": {
    "lat": 6.4698,
    "lng": 3.5852,
    "address": "Lekki Phase 1, Lagos, Nigeria",
    "area": "Lekki"
  },
  "description": "Heavy traffic congestion on Lekki-Epe Expressway",
  "severity": "high | medium | low",
  "source": "external",
  "sourceUrl": "https://...",
  "timestamp": "2024-01-15T08:30:00Z",
  "expiresAt": "2024-01-15T11:00:00Z",
  "isActive": true,
  "confirmations": 0
}
```

**Severity → map pin color:**
- `high` → Red
- `medium` → Orange  
- `low` → Yellow

**Source:**
- `external` = pipeline data (shown with slightly different pin style)
- `user` = user-submitted reports (added by your mobile app later)

---

## Deployment Targets (dev + prod)

There are two Firebase projects, and **this pipeline writes to both on every
run**:

| Target | Project       | Service account secret                 |
| ------ | ------------- | -------------------------------------- |
| dev    | `voxiro-app`  | `FIREBASE_SERVICE_ACCOUNT_JSON`        |
| prod   | `voxiro-prod` | `FIREBASE_SERVICE_ACCOUNT_JSON_PROD`   |

The targets are declared in `.github/workflows/pipeline.yml`'s `strategy.matrix`,
**not** in a GitHub secret. That's deliberate. The workflow used to read the
destination from `secrets.FIREBASE_PROJECT_ID`, which meant nothing in this
codebase said where the data landed — and when `voxiro-prod` was split out,
that secret kept pointing at `voxiro-app`. Nobody could see it by reading the
repo. A project ID isn't a secret; only the key is.

That mistargeting was a launch blocker for two reasons, not one:

1. **No external reports in prod.** Every scraped report went to the dev
   project.
2. **No expiry in prod.** `expireOldReports()` is not a separate cron — it
   runs inline at the end of every pipeline run (`src/index.ts` `main()` →
   `runExpiryJob()`), and it expires **all** active reports past `expiresAt`,
   community and external alike. Nothing else in either repo reads
   `expiresAt`. So a project the pipeline never runs against has no expiry at
   all: community reports stay on the map indefinitely until three users vote
   them cleared, and `AllClearBanner` never fires again.

Each target is fully independent — its own Firestore database, its own
`geocodeCache`, its own dedup state. `fail-fast: false` keeps a prod failure
from cancelling the dev job. Before running, each job asserts that the
service-account key's `project_id` matches the target it was handed: a key
from the wrong project authenticates perfectly well and silently writes to
the wrong Firestore, which is the exact failure this matrix exists to prevent.

Report lifetimes are not configurable per environment: `EXPIRY_HOURS` in
`reportsService.ts` is a per-incident-type table (flood 4h, traffic 2h,
accident 2h, road blockage 3h) mirroring `voxiro-app/constants/incidents.ts`
and VOXIRO_MVP_SPEC.md §6. The old flat `REPORT_EXPIRY_HOURS` env var is gone
-- it predated that table and made scraped floods clear 90 minutes early.

### Before the first prod run

A new Firebase project starts with **zero composite indexes**, and index
deploys are a separate step from everything else — declaring an index in
`firestore.indexes.json` does not create it. `expireOldReports()` queries
`isActive == true && expiresAt <= now`, which needs one; without it the query
throws, the `try/catch` in `reportsService.ts` swallows it to a log line, and
expiry silently no-ops while the run still reports success. Verify with:

```bash
npx firebase-tools firestore:indexes --project voxiro-prod
```

If that prints `"indexes": []`, deploy them from the **app** repo (see the
Firestore Indexes section below for why the file lives in two places):

```bash
cd ../voxiro-app && npx firebase-tools deploy --only firestore:indexes --project voxiro-prod
```

Firestore rules need the same treatment, and also only exist in the app repo.

---

## Firestore Security Rules

`voxiro-app/firestore.rules` is the only copy — this repo doesn't have its
own and can't deploy rules at all (`firebase.json` here has no `"rules"`
key). That's deliberate, not an oversight: this pipeline talks to Firestore
exclusively via the Admin SDK (`src/lib/firebase.ts`
`admin.credential.cert(serviceAccount)`), which bypasses security rules
unconditionally, so nothing here has ever actually needed rules deployed
from this repo. A stale local copy used to exist and be wired into
`firebase.json` regardless — a leftover from before `voxiro-app` existed,
never kept in sync, and different from what was actually documented even
here (compare git history if curious). If it had ever been deployed
(`firebase deploy` unscoped, or `--only firestore:rules`, run from this
directory against the shared `voxiro-app` project), it would have replaced
the app's real production rules with that stale stand-in — blocking every
community report write, exposing inactive/flagged reports publicly, and
locking out profile/leaderboard/confirmation access entirely, since it only
covered `reports/` and `pipeline_state/`. Removed rather than fixed, since
there was never a real need for it: if you need to change what the app's
Firestore rules allow, edit `voxiro-app/firestore.rules` directly.

---

## Cloud Functions

There are none here. All Cloud Functions live in `voxiro-app/functions/` and
deploy from that repo.

A `functions/` folder used to exist here holding a single `onReportCreated`
push-notification trigger — the original geofencing prototype. It was
superseded by `voxiro-app/functions/src/index.ts`, which now has eight
functions including a rewritten `onReportCreatedNotify`, and the copy here was
never updated or deployed again.

It was worse than merely dead. Both repos declared `"codebase": "default"` in
their `firebase.json`, and a functions deploy replaces everything in a
codebase with whatever the deploying directory contains. So `firebase deploy
--only functions` run from here would have deleted all eight live functions —
profile creation, moderation, points, streaks, notifications — and left the one
stale trigger in their place. Nothing warned about this; the two folders simply
looked like separate projects.

Removed along with `firebase.json`, so this directory can no longer deploy
anything at all.

---

## Firestore Indexes

This repo has **no** `firestore.indexes.json` and no `firebase.json`, and
cannot deploy anything. `voxiro-app/firestore.indexes.json` is the only copy.

That's for the same reason the Firestore rules copy was removed (section
above): this pipeline reaches Firestore purely through the Admin SDK, so it
needs the indexes to *exist*, not to declare them. Keeping a second copy here
bought nothing and cost real safety — `firebase deploy --only
firestore:indexes` is declarative, reconciling the live index set to exactly
match the local file and deleting anything absent from it. The two copies had
already drifted: the app's `submittedBy + timestamp` index (profile "my
reports") was missing here, so a deploy run from this directory would have
silently deleted it. The same class of mistake had already broken the app's
map/feed once.

Syncing the copies would have meant remembering, forever, to edit two files in
two repos in one change. Deleting this one removes the failure mode instead of
policing it. `firebase deploy` from this directory now fails outright with
"Not in a Firebase app directory".

**If you add a query here that needs a new index** (anything filtering or
ordering on more than one field), add it to `voxiro-app/firestore.indexes.json`
and deploy from there:

```bash
cd ../voxiro-app && npx firebase-tools deploy --only firestore:indexes --project voxiro-prod
```

The queries in this repo that currently depend on an index are
`expireOldReports` (`isActive` + `expiresAt`) and the dedup lookup in
`processors/deduplicator.ts`. Both are already covered.

---

## What Gets Built on Top of This

This pipeline is Phase 1. Everything else connects to the same `reports` Firestore collection:

```
Phase 1 (this):     External data pipeline → Firestore
Phase 2 (Week 2):   React Native app reads from Firestore → shows map
Phase 3 (Week 2):   User report flow → writes to same Firestore collection
Phase 4 (Week 3):   Push alerts → Firebase Cloud Messaging
Phase 5 (Week 4):   Points/leaderboard system → users collection
```

---

## Cost Estimate (MVP Scale)

| Service | Usage | Monthly Cost |
|---|---|---|
| Firebase Firestore | ~1,000 reads/writes/day | Free tier |
| Google Geocoding API | <100 calls/month (cached) | Free tier (10k/month free) |
| Google Alerts | Unlimited | Free |
| **Total** | | **~$0/month** |

Scales to ~50,000 users before needing to optimize.

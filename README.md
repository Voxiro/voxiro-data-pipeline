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
FIREBASE_PROJECT_ID=voxiro
GOOGLE_ALERTS_RSS_URLS=https://www.google.com/alerts/feeds/URL1,https://www.google.com/alerts/feeds/URL2
GOOGLE_GEOCODING_API_KEY=AIza...   # optional — see Step 4
SCRAPE_INTERVAL_MINUTES=30
REPORT_EXPIRY_HOURS=2.5
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

## Firestore Indexes

`firestore.indexes.json` here and in `voxiro-app/firestore.indexes.json` are
kept **identical** — both list the full union of every index either repo's
queries need (this pipeline's `expireOldReports`/dedup queries, plus the app's
live map/feed listener). `firebase deploy --only firestore:indexes` is
declarative: it reconciles the *live* index set to exactly match whatever's
in the local file, deleting anything not listed. With two repos pointed at
the same Firestore project, a deploy from either one with a partial file
would silently delete indexes the other repo depends on — this already broke
the app's map/feed once. If you add a new query here that needs a new index,
add it to both files, in both repos, in the same change.

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

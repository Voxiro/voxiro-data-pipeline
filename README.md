# Voxiro — Data Pipeline

Automatically populates the Voxiro map with Lagos traffic, flood, and road incident data from external sources. Solves the cold start problem — your map has live data before a single user signs up.

## How It Works

```
Every 30 minutes:
  Google Alerts RSS feeds
        ↓
  Claude AI parses raw text
        ↓
  Google Geocoding API → lat/lng
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

### 4. Set up Google Geocoding API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or use existing
3. Enable **Geocoding API**
4. Go to **Credentials** → **Create API Key**
5. Copy the key

> **Cost**: $5 per 1,000 geocoding calls. With 30 reports/day, that's ~$4.50/month.

### 5. Get Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create API Key
3. Copy it

> **Cost**: Claude Sonnet is ~$3 per million tokens. Parsing 50 reports/day costs roughly $0.10/day.

### 6. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
FIREBASE_PROJECT_ID=voxiro
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_ALERTS_RSS_URLS=https://www.google.com/alerts/feeds/URL1,https://www.google.com/alerts/feeds/URL2
GOOGLE_GEOCODING_API_KEY=AIza...
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

Add these rules in Firebase Console → Firestore → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Reports: anyone can read active reports, only server can write
    match /reports/{reportId} {
      allow read: if resource.data.isActive == true;
      allow write: if false; // only Admin SDK (pipeline) can write
    }
    
    // Pipeline state: server only
    match /pipeline_state/{docId} {
      allow read, write: if false;
    }
  }
}
```

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
| Claude API | ~50 reports/day parsed | ~$3 |
| Google Geocoding | ~50 geocodes/day | ~$4.50 |
| Google Alerts | Unlimited | Free |
| **Total** | | **~$7.50/month** |

Scales to ~50,000 users before needing to optimize.

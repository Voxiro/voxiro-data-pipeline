# Voxiro — Full Project Context
> Use this document to continue planning, design, and development in a new session.
> Last updated: April 2026

---

## 1. What Is This Product

**Voxiro** is a hyperlocal incident reporting app for Lagos, Nigeria.

**The core value proposition — one sentence:**
> "Is there something happening near me right now that will mess up my movement?"

Users open the app before leaving home or the office and see a live map of traffic jams, flooding, road blockages, and accidents in their area. They can also report incidents in under 5 seconds.

**This is not a navigation app.** It does not compete with Google Maps on routing. It competes on local awareness — the kind of real-time, ground-level knowledge that only people in Lagos have.

---

## 2. Target Market

- **Primary city:** Lagos, Nigeria (MVP only)
- **Primary users:** Daily commuters, ride-hail drivers, delivery riders, dispatch riders
- **Device reality:** Android-heavy market, mid-range devices, variable network quality
- **Behaviour insight:** Lagos users already share traffic updates in WhatsApp groups — Voxiro is the structured, map-based version of that existing behaviour

---

## 3. The Cold Start Problem & How We're Solving It

The biggest risk for any location-based app: the map looks empty on Day 1, users leave, and never come back.

**Our solution: a data pipeline that seeds the map before a single user signs up.**

The pipeline (`voxiro-data-pipeline`) runs every 30 minutes and:
1. Pulls Lagos traffic/flood/accident news from Google Alerts RSS feeds
2. Parses the raw text using keyword matching (Lagos-specific knowledge base)
3. Geocodes location names to lat/lng coordinates
4. Writes structured reports to Firestore
5. Auto-expires reports after 2.5 hours to keep the map fresh

This means when the first user opens the app, the map already has live pins. The goal long-term is **70% user-submitted reports, 30% external pipeline data.**

---

## 4. Data Pipeline — Status: Built, Needs Testing

### Repository
- **Folder name:** `voxiro-data-pipeline`
- **Stack:** Node.js + TypeScript, Firebase Admin SDK, RSS Parser, node-cron

### What's built
- Google Alerts RSS scraper (`src/scrapers/googleAlerts.ts`)
- Keyword-based report parser — no AI API needed (`src/processors/parseReport.ts`)
- Deduplication logic (`src/processors/deduplicator.ts`)
- Firestore write service with auto-expiry (`src/services/reportsService.ts`)
- Cron scheduler — runs every 30 mins (`src/index.ts`)
- Full TypeScript types (`src/types/report.ts`)
- Firebase client (`src/lib/firebase.ts`)

### What still needs to be done
- [ ] Set up Google Alerts RSS feeds at google.com/alerts (free)
- [ ] Fill in `.env` file with Firebase project ID + RSS URLs
- [ ] Run `npm install` and test with `npm run dev -- --once`
- [ ] Confirm reports appear in Firestore Console
- [ ] Push to GitHub

### Key design decisions
- **No AI API key required** — parser uses keyword matching. Can be upgraded to Claude API later.
- **No Google Geocoding API required for MVP** — hardcoded coordinates for 35+ Lagos locations as fallback
- **External reports are marked `source: "external"`** — shown differently on map vs user reports
- Reports auto-expire after 2.5 hours (`isActive: false`) — keeps map clean

### Firestore Data Model
Every report (both pipeline and user-submitted) uses this schema:
```
reports/{id}
  type:          "traffic" | "flood" | "road_blockage" | "accident"
  location:
    lat:         number
    lng:         number
    address:     string   // "Lekki Phase 1, Lagos"
    area:        string   // "Lekki" — for leaderboards
  description:   string   // user-facing, 1 sentence
  severity:      "low" | "medium" | "high"
  source:        "user" | "external"
  sourceUrl:     string?  // for external reports
  image:         string?  // Firebase Storage URL
  timestamp:     Timestamp
  expiresAt:     Timestamp
  isActive:      boolean
  confirmations: number   // "+3 people confirmed this"
  userId:        string?  // only for user reports
```

### Severity → map pin colour
- `high` → Red `#FF3B30`
- `medium` → Orange `#FF9500`
- `low` → Yellow `#FFCC00`

---

## 5. Mobile App — Not Built Yet

### Stack (decided)
- **Framework:** React Native with Expo
- **Database:** Firebase Firestore (same DB as pipeline — real-time listeners)
- **Auth:** Firebase Auth
- **Maps:** react-native-maps with Google Maps SDK
- **Location:** expo-location
- **Notifications:** expo-notifications + Firebase Cloud Messaging (FCM)
- **Storage:** Firebase Storage (for user photo uploads)
- **Analytics:** Firebase Analytics

### Why this stack
- One codebase for Android + iOS
- Firestore real-time listeners = map updates instantly without WebSockets
- No DevOps needed — Firebase handles everything
- Builder has strong React knowledge — React Native is a natural extension

---

## 6. App Screens — Full Requirements

### Screen 1: Live Incident Map (THE product)
This is the home screen. Must feel immediately useful.

**Requirements:**
- Map centred on user's current location
- Pins for each active report, colour-coded by severity (red/orange/yellow)
- Pin icons differ by type: traffic cone, flood wave, barrier, crash symbol
- External pipeline reports shown with slightly different pin style (e.g. outlined vs filled) so users can distinguish
- Tap a pin → bottom sheet slides up showing:
  - Incident type + icon
  - Description
  - "5 mins ago" style relative timestamp
  - Location name ("Lekki Phase 1")
  - Confirmation count ("+3 confirmed")
  - "Confirm" button (adds to confirmations, gives user +3 points)
  - Photo if available
- Floating "Report Issue" button — always visible, bottom right
- Top bar: app name/logo + notification bell
- Auto-refreshes via Firestore real-time listener — no manual refresh needed

**Empty state (no reports in area):**
- Show map with user location
- Subtle message: "All clear in your area" with a green indicator
- Do NOT show a blank map with no context

### Screen 2: Report Flow (5 seconds max — the growth engine)
Triggered by tapping the floating "Report Issue" button.

**Step 1 — Select type (full screen modal):**
Four large tappable cards:
- 🚦 Traffic Jam
- 🌊 Flood
- 🚧 Road Blockage
- 💥 Accident

**Step 2 — Confirm location:**
- Map snippet showing user's current detected location
- Location name shown below map ("Detected: Lekki Phase 1")
- "This is correct" button (large, primary)
- "Adjust location" option (lets user drag pin)

**Step 3 — Submit:**
- Optional: "Add a note" (single text field, placeholder: "e.g. water is knee-deep")
- Optional: camera icon to attach photo
- Large "Submit Report" button
- Tapping submit → instant success state:
  - Animated checkmark
  - "+10 points" shown with subtle animation
  - Message: "Thanks — your report is live on the map"
  - Auto-dismiss after 2 seconds

**Rules:**
- Maximum 3 taps from button to submitted report
- Location is auto-detected — never force user to type an address
- Photo is always optional, never required
- Never show a loading spinner longer than 1 second

### Screen 3: Feed View (trust layer)
A reverse-chronological list of recent reports near the user.

**Each feed item shows:**
- Incident type icon + colour dot (severity)
- Location name — bold
- Description — 1 line
- Relative time — "3 mins ago", "12 mins ago"
- Source indicator — small label: "Reported by user" or "From news"
- Confirmation count

**Behaviour:**
- Sorted by most recent first
- Only shows `isActive: true` reports
- Pull to refresh
- Tap item → same bottom sheet as tapping map pin
- Feels like a Twitter/X feed but cleaner

**Empty state:**
"No incidents reported nearby in the last 2 hours. Tap + to report one."

### Screen 4: Notifications / Alerts
Push notifications (not a dedicated screen — system-level alerts):
- "🌊 Flood reported 0.8km from you — Lekki Phase 1"
- "🚦 Heavy traffic building on your usual route"
- "✅ Your report was confirmed by 3 people — +9 points"

Triggered by Firebase Cloud Messaging based on geofencing logic.

### Screen 5: Profile / Points Screen
- User's total points
- Current title/badge: "Area Scout", "Traffic Commander", "Flood Watcher"
- Weekly rank in their area (e.g. "#3 in Lekki this week")
- Report history — list of their past reports
- Weekly leaderboard — top 10 reporters in their area

**Points system:**
- Submit a report = +10 points
- Confirm someone else's report = +3 points
- Upload a photo with report = +5 bonus
- First report in an area (within 30 mins) = +15 points

**Status titles by points:**
- 0–99: "Newcomer"
- 100–499: "Area Scout"
- 500–999: "Traffic Watcher"
- 1000–2499: "Road Commander"
- 2500+: "Voxiro Legend"

### Screen 6: Onboarding (first launch only)
- 3 slides max — do not overdo this
- Slide 1: "Know before you go" — map visual
- Slide 2: "Report in 5 seconds" — report flow visual
- Slide 3: "Earn rewards for helping your community" — points visual
- "Get Started" → request location permission → go to map

---

## 7. Trust & Quality Systems

### Freshness filter
- Reports auto-hide after 2.5 hours (`isActive: false`)
- Timestamps shown everywhere in relative format ("5 mins ago")
- Expired reports never shown on map or feed

### Confirmation system
- Any user can tap "Confirm" on a report
- Adds +1 to `confirmations` count
- Rewards confirmer with +3 points
- Reports with 3+ confirmations get a visual boost (slightly larger pin)

### Spam prevention
- Do NOT pay per report → encourages fake reports
- Weekly rewards for top reporters only (quality over quantity)
- False report flag (future) — users can flag as inaccurate
- Reputation score (future) — accurate reporters earn more visibility

---

## 8. Growth Strategy

### Phase 1: Seed the map (pipeline does this)
Map has data before first user opens app.

### Phase 2: WhatsApp bridge
- Simple bot via Termii (Nigerian provider)
- User sends: location pin + "Traffic at Lekki toll gate"
- System converts to a Firestore report
- Removes app install friction entirely
- Leverages existing Lagos WhatsApp group behaviour

### Phase 3: Power user recruitment
- Recruit 20–30 okada riders, delivery riders, dispatch riders
- Offer guaranteed weekly airtime rewards (₦2,000–₦5,000)
- These users are on the road all day — natural reporters
- 100 power users beats 10,000 random users

### Phase 4: Sponsored rewards
- Logistics companies sponsor leaderboards
- "Top Kwik delivery riders this week win..."
- Turns incentive system into a B2B revenue line

---

## 9. What NOT to Build (MVP)
Explicitly out of scope:
- ❌ Turn-by-turn navigation
- ❌ Route planning or suggestions
- ❌ Complex routing algorithms
- ❌ Full social features (comments, follows, etc.)
- ❌ AI predictions or traffic forecasting
- ❌ Web app version
- ❌ Anything Google Maps already does well

---

## 10. Success Metrics (30-day targets)
- % of users who open app before a trip
- Reports per active user per week
- Daily Active / Weekly Active ratio
- Average reports per area per hour during rush hour (7–9am, 5–8pm)
- **The real metric: "Is the map alive or empty?"**

Target after 2–4 weeks of launch:
- 20–30% of users submit at least 1 report
- Core users submitting daily
- Each focus area (start with Lekki corridor) has multiple reports per hour
- Leaderboard competition is visibly active

---

## 11. Recommended Design Direction for Mobile App

### Aesthetic
- **Dark map base** with bright, high-contrast pins — readable in Lagos sunlight
- **Bold, utilitarian typography** — this is a tool, not a lifestyle app
- **High contrast UI** — works on cheap Android screens in direct sunlight
- Primary colour: deep orange or signal red — evokes urgency, Lagos energy
- Secondary: near-black background for map screens
- Clean white cards for feed and profile screens

### UX Principles specific to Lagos users
- **Works on slow 3G** — no heavy animations, lazy load images
- **Generous touch targets** — 48px minimum, users often on the move
- **Minimal typing** — pre-filled options everywhere, auto-detect location always
- **Offline awareness** — show last known state if connection drops, never blank screen
- **Instant feedback** — every tap must respond in under 100ms visually

### Key UX moments to get right
1. Opening the app and seeing a live map in under 3 seconds
2. The satisfying "+10 points" animation after submitting a report
3. Receiving a push notification that saves you from a flooded road
4. Seeing your name on the Lekki leaderboard

---

## 12. Technical Considerations for App Build

### Firebase Firestore queries the app needs
```
// Active reports near user (map)
db.collection('reports')
  .where('isActive', '==', true)
  .orderBy('timestamp', 'desc')
  .limit(50)

// Feed view
db.collection('reports')
  .where('isActive', '==', true)
  .where('location.area', '==', userArea)
  .orderBy('timestamp', 'desc')
  .limit(20)

// User's own reports
db.collection('reports')
  .where('userId', '==', currentUserId)
  .orderBy('timestamp', 'desc')
```

### Firestore Security Rules needed
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /reports/{reportId} {
      // Anyone can read active reports
      allow read: if resource.data.isActive == true;
      // Only authenticated users can create reports
      allow create: if request.auth != null;
      // Users can only update confirmations, not rewrite reports
      allow update: if request.auth != null
        && request.resource.data.diff(resource.data).affectedKeys()
            .hasOnly(['confirmations']);
    }
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Expo project setup commands
```bash
npx create-expo-app voxiro-app --template blank-typescript
cd voxiro-app
npx expo install react-native-maps expo-location expo-notifications
npx expo install firebase
```

### Environment variables needed for app
```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

---

## 13. Build Sequence (recommended order)

**Week 1 — Foundation**
- [ ] Finish pipeline setup and confirm data flowing to Firestore
- [ ] Expo project initialised
- [ ] Firebase connected to app
- [ ] Map screen rendering with live Firestore pins

**Week 2 — Core UX**
- [ ] Pin tap → bottom sheet detail view
- [ ] Report flow (3 taps)
- [ ] Feed view
- [ ] Firebase Auth (anonymous to start, upgrade to phone auth later)

**Week 3 — Retention hooks**
- [ ] Push notifications via FCM
- [ ] Points system
- [ ] Profile screen with leaderboard
- [ ] Photo upload via Firebase Storage

**Week 4 — Growth**
- [ ] WhatsApp bot integration (Termii)
- [ ] Onboarding flow
- [ ] Polish + test on real Android devices
- [ ] Internal beta with 10–20 seed users (riders, friends)

---

## 14. Open Questions to Resolve

1. **Auth strategy** — Anonymous first (lowest friction) or phone number OTP from Day 1 (better for points/leaderboard integrity)?
2. **Android-first or iOS-first** for beta? Lagos is Android-heavy — recommend Android-first.
3. **Airtime reward fulfilment** — need a Termii or similar account to programmatically send airtime to top reporters.
4. **Google Maps API billing** — need to enable Maps SDK and set up billing in Google Cloud Console before map will render in production.

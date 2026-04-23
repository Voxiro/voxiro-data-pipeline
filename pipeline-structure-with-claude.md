voxiro-pipeline/
├── src/
│   ├── lib/
│   │   ├── firebase.ts          # Firebase Admin SDK init
│   │   ├── anthropic.ts         # Claude API client
│   │   └── logger.ts            # Simple logger
│   ├── scrapers/
│   │   ├── googleAlerts.ts      # RSS feed parser
│   │   └── lasma.ts             # LASMA social scraper (Phase 2)
│   ├── processors/
│   │   ├── parseReport.ts       # Claude parses raw text → structured report
│   │   └── deduplicator.ts      # Prevent duplicate reports
│   ├── services/
│   │   └── reportsService.ts    # Writes to Firestore
│   ├── types/
│   │   └── report.ts            # All TypeScript types
│   └── index.ts                 # Cron job entry point
├── .env
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json



Every 30 minutes:
    ↓
1. Fetch all Google Alerts RSS feeds
    ↓
2. Filter: only items newer than last run
    ↓
3. For each item → send raw text to Claude API
    ↓
4. Claude returns: { type, location, severity, description, isLagosRelated }
    ↓
5. If isLagosRelated = false → discard
    ↓
6. Geocode the location string → get lat/lng
    ↓
7. Check deduplicator → is this report already in Firestore?
    ↓
8. If new → write to Firestore with expiresAt = now + 2.5 hours
    ↓
9. Separate cron every 15 mins → mark expired reports isActive = false
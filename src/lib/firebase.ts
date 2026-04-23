// src/lib/firebase.ts
// Firebase Admin SDK — single instance used across the entire pipeline

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

let db: admin.firestore.Firestore;

export function initFirebase(): admin.firestore.Firestore {
  if (db) return db;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!serviceAccountPath || !projectId) {
    throw new Error(
      'Missing FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID in .env'
    );
  }

  const absolutePath = path.resolve(serviceAccountPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Firebase service account key not found at: ${absolutePath}\n` +
      'Download it from Firebase Console → Project Settings → Service Accounts'
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  db = admin.firestore();

  // Use Lagos timezone-aware timestamps
  db.settings({ ignoreUndefinedProperties: true });

  logger.success('Firebase initialized');
  return db;
}

export function getFirestore(): admin.firestore.Firestore {
  if (!db) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return db;
}

// Collection references — single source of truth for collection names
export const COLLECTIONS = {
  REPORTS: 'reports',
  PIPELINE_STATE: 'pipeline_state',   // tracks last run time per source
  USERS: 'users',                      // future — user accounts
  GEOCODE_CACHE: 'geocodeCache',       // persistent geocoding results (TTL: 28 days)
} as const;

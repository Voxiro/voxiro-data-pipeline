// src/lib/logger.ts
// Simple logger — keeps output clean and consistent

const DEBUG = process.env.DEBUG === 'true';

function timestamp(): string {
  return new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });
}

export const logger = {
  info: (msg: string, data?: unknown) => {
    console.log(`[${timestamp()}] ℹ️  ${msg}`, data !== undefined ? data : '');
  },
  success: (msg: string, data?: unknown) => {
    console.log(`[${timestamp()}] ✅ ${msg}`, data !== undefined ? data : '');
  },
  warn: (msg: string, data?: unknown) => {
    console.warn(`[${timestamp()}] ⚠️  ${msg}`, data !== undefined ? data : '');
  },
  error: (msg: string, err?: unknown) => {
    console.error(`[${timestamp()}] ❌ ${msg}`, err !== undefined ? err : '');
  },
  debug: (msg: string, data?: unknown) => {
    if (DEBUG) {
      console.log(`[${timestamp()}] 🔍 ${msg}`, data !== undefined ? data : '');
    }
  },
  pipeline: (msg: string) => {
    console.log(`\n[${timestamp()}] 🚀 ===== ${msg} =====\n`);
  }
};

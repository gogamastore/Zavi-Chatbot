// ---------------------------------------------------------------------------
// Firebase Admin / Firestore initialization (lazy, singleton).
// Only imported when Firestore credentials are configured.
// Node.js runtime only (firebase-admin is marked serverExternalPackages).
// ---------------------------------------------------------------------------
import { env } from "@/lib/config";
import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | null = null;
let db: Firestore | null = null;

function initApp(): App {
  if (getApps().length) return getApps()[0]!;

  if (env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey) {
    return initializeApp({
      credential: cert({
        projectId: env.firebaseProjectId,
        clientEmail: env.firebaseClientEmail,
        privateKey: env.firebasePrivateKey,
      }),
    });
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS (path to service-account JSON).
  return initializeApp({ credential: applicationDefault() });
}

/** App Firebase Admin (dipakai Firestore dan verifikasi token Auth). */
export function getAdminApp(): App {
  app ??= initApp();
  return app;
}

export function getDb(): Firestore {
  if (db) return db;
  app ??= initApp();
  // A named database must be requested explicitly; omitting the id targets
  // "(default)", which does not exist in every project.
  db = env.firebaseDatabaseId
    ? getFirestore(app, env.firebaseDatabaseId)
    : getFirestore(app);
  return db;
}

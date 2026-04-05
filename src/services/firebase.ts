import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeFirestore, collection, query, where, doc, getDoc, setDoc,
  deleteDoc, onSnapshot, runTransaction, serverTimestamp
} from 'firebase/firestore';
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  signOut, signInAnonymously, deleteUser, User as FirebaseUser, signInWithCredential
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { Offer, UserProfile, Transaction } from '../types';

// ═══════════════════════════════════════════════════════════════════════
// v12: COMPLETE AUTH REBUILD
//
// Replaced @codetrix-studio/capacitor-google-auth (broken, hangs on signIn())
// with @capacitor-firebase/authentication (official Capacitor Firebase plugin).
//
// How it works:
//   1. FirebaseAuthentication.signInWithGoogle() shows the NATIVE Google
//      account picker (stays inside the app — no browser redirect).
//   2. The plugin returns a credential with an idToken.
//   3. We exchange that idToken for a Firebase web SDK credential via
//      GoogleAuthProvider.credential() → signInWithCredential().
//   4. The existing onAuthStateChanged listener picks up the new user.
//
// Why this plugin works when the old one didn't:
//   - Uses Google Identity Services (modern API) instead of the deprecated
//     GoogleSignIn API that had activity result callback issues.
//   - Maintained by the Capacitor community team, tested with Capacitor 6.
//   - Native dependencies are auto-resolved by the Capacitor plugin system.
// ═══════════════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: 'AIzaSyBLlefWEa3WHUSPD0_sDTvpCTqIImh5X6Y',
  authDomain: 'rewardhub-1ea27.firebaseapp.com',
  projectId: 'rewardhub-1ea27',
  storageBucket: 'rewardhub-1ea27.firebasestorage.app',
  messagingSenderId: '563861371307',
  appId: '1:563861371307:web:7db5542c5b2f2e46247aee',
  measurementId: 'G-PCK58GKBKM'
};

export const isConfigValid = true;
let app;
try { app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp(); }
catch (e) { console.error("Firebase init failed:", e); }

const db = app ? initializeFirestore(app, { experimentalForceLongPolling: true }) : null;
const auth = app ? getAuth(app) : null;
const googleProvider = new GoogleAuthProvider();

export { auth, db };
export type { FirebaseUser };

function getCol(uid: string) { return uid.startsWith('local_guest_') ? 'guests' : 'users'; }
function handleFsError(error: unknown, path: string | null, shouldThrow = true) {
  console.error('Firestore Error:', error instanceof Error ? error.message : String(error), 'path:', path);
  if (shouldThrow) throw error;
}

export const firebaseService = {
  // ─── GOOGLE SIGN-IN ──────────────────────────────────────────────
  async signInWithGoogle() {
    if (!auth) throw new Error("Firebase Auth not initialized");

    if (Capacitor.isNativePlatform()) {
      // ── NATIVE: Use @capacitor-firebase/authentication ──
      // Shows the native Google account picker inside the app.
      // No browser redirect. No external tab.
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

        console.log("[Auth] Calling FirebaseAuthentication.signInWithGoogle()...");
        const result = await FirebaseAuthentication.signInWithGoogle();
        console.log("[Auth] Native sign-in returned. Email:", result?.user?.email);

        // Extract the idToken from the credential
        const idToken = result?.credential?.idToken;
        if (!idToken) {
          console.error("[Auth] No idToken in result. credential:", JSON.stringify(result?.credential));
          throw new Error(
            "Google account selected but no authentication token received. " +
            "Please verify SHA-1 fingerprints in Firebase Console."
          );
        }

        // Exchange for Firebase web SDK credential
        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(auth, credential);
        console.log("[Auth] Firebase sign-in success:", userCredential.user.uid);

        await this._ensureProfile(userCredential.user);
        return userCredential.user;

      } catch (error: any) {
        const msg = error?.message || String(error);
        // User cancelled the picker — not an error
        if (msg.includes('canceled') || msg.includes('cancelled') || msg.includes('closed')) {
          throw new Error("Sign-in cancelled.");
        }
        console.error("[Auth] Native sign-in error:", error);
        throw error;
      }
    }

    // ── WEB: Use Firebase signInWithPopup ──
    try {
      console.log("[Auth] Using web signInWithPopup...");
      const result = await signInWithPopup(auth, googleProvider);
      await this._ensureProfile(result.user);
      return result.user;
    } catch (error) {
      console.error("[Auth] Web sign-in error:", error);
      throw error;
    }
  },

  async _ensureProfile(fbUser: FirebaseUser, fallbackEmail?: string) {
    const profile = await this.getUserProfile(fbUser.uid);
    if (!profile) {
      await this.saveUserProfile({
        uid: fbUser.uid, email: fbUser.email || fallbackEmail || 'Unknown',
        points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0,
        boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0,
        lastBoostDate: new Date().toDateString()
      });
    }
  },

  async signInAnonymously() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    const result = await signInAnonymously(auth);
    await this._ensureProfile(result.user, 'Guest User');
    return result.user;
  },

  async logout() {
    if (auth) await signOut(auth);
    // Also sign out of the native layer
    if (Capacitor.isNativePlatform()) {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signOut();
      } catch {}
    }
  },

  async deleteAccount() { if (auth?.currentUser) await deleteUser(auth.currentUser); },
  async deleteUserProfile(uid: string) { if (db) await deleteDoc(doc(db, getCol(uid), uid)); },
  onAuthChange(cb: (user: FirebaseUser | null) => void) { if (!auth) { cb(null); return () => {}; } return onAuthStateChanged(auth, cb); },

  // ─── PROFILE ─────────────────────────────────────────────────────
  onProfileChange(uid: string, cb: (p: UserProfile | null) => void) {
    if (!db) { cb(null); return () => {}; }
    return onSnapshot(doc(db, getCol(uid), uid), d => cb(d.exists() ? d.data() as UserProfile : null),
      err => { handleFsError(err, `${getCol(uid)}/${uid}`, false); cb(null); });
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!db) return null;
    try { const d = await getDoc(doc(db, getCol(uid), uid)); if (d.exists()) { const p = d.data() as UserProfile; localStorage.setItem(`profile_${uid}`, JSON.stringify(p)); return p; } const c = localStorage.getItem(`profile_${uid}`); return c ? JSON.parse(c) : null; }
    catch { const c = localStorage.getItem(`profile_${uid}`); return c ? JSON.parse(c) : null; }
  },

  async saveUserProfile(profile: UserProfile) {
    if (!db) return;
    try { await setDoc(doc(db, getCol(profile.uid), profile.uid), profile, { merge: true }); localStorage.setItem(`profile_${profile.uid}`, JSON.stringify(profile)); }
    catch (e) { handleFsError(e, `${getCol(profile.uid)}/${profile.uid}`, false); }
  },

  async checkDailyReset(uid: string) {
    if (!db) return;
    if (!uid.startsWith('local_guest_') && (!auth || !auth.currentUser)) return;
    try { const d = await getDoc(doc(db, getCol(uid), uid)); if (d.exists() && d.data().lastBoostDate !== new Date().toDateString()) { await setDoc(doc(db, getCol(uid), uid), { boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString() }, { merge: true }); } }
    catch (e) { handleFsError(e, `${getCol(uid)}/${uid}`, false); }
  },

  // ─── AD WATCH (with bounds guard) ───────────────────────────────
  async recordAdWatch(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    const userRef = doc(db, getCol(uid), uid); const today = new Date().toDateString();
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef); let d: any;
      if (!snap.exists()) { d = { uid, points: 0, totalEarned: 0, boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: today, email: auth?.currentUser?.email || 'Unknown' }; tx.set(userRef, d); } else { d = snap.data(); }
      let boostLevel = Number(d.boostLevel) || 1; let currentLevelAdCounter = Number(d.currentLevelAdCounter) || 0; let lastBoostDate = d.lastBoostDate || null;
      if (lastBoostDate !== today) { boostLevel = 1; currentLevelAdCounter = 0; }
      const adsNeeded = boostLevel;
      if (currentLevelAdCounter >= adsNeeded) return { boostLevel, currentLevelAdCounter, adsNeeded };
      currentLevelAdCounter += 1;
      tx.set(userRef, { currentLevelAdCounter, lastBoostDate: today }, { merge: true });
      return { boostLevel, currentLevelAdCounter, adsNeeded };
    });
  },

  async claimBoostReward(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    const userRef = doc(db, getCol(uid), uid); const historyRef = doc(collection(db, 'history')); const today = new Date().toDateString();
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef); if (!snap.exists()) throw new Error("User not found"); const d = snap.data();
      let boostLevel = Number(d.boostLevel) || 1; let currentLevelAdCounter = Number(d.currentLevelAdCounter) || 0; let adsWatchedToday = Number(d.adsWatchedToday) || 0; let points = Number(d.points) || 0; let totalEarned = Number(d.totalEarned) || 0;
      if (currentLevelAdCounter < boostLevel) throw new Error("Boost requirement not met");
      points += 100; totalEarned += 100; const completedLevel = boostLevel; boostLevel += 1; adsWatchedToday += 1; currentLevelAdCounter = 0;
      tx.set(userRef, { points, totalEarned, boostLevel, adsWatchedToday, currentLevelAdCounter, lastBoostDate: today }, { merge: true });
      tx.set(historyRef, { uid, type: 'earn', points: 100, message: `Completed Boost Level ${completedLevel}`, timestamp: serverTimestamp() });
      return { points, boostLevel };
    });
  },

  // ─── LISTENERS ───────────────────────────────────────────────────
  onOffersChange(cb: (offers: Offer[]) => void) { if (!db) { cb([]); return () => {}; } return onSnapshot(query(collection(db, 'offers')), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data(), points: Number(d.data().points || 0) } as Offer))), err => { handleFsError(err, 'offers', false); cb([]); }); },
  onClaimsChange(uid: string, cb: (claims: Transaction[]) => void) { if (!db) { cb([]); return () => {}; } return onSnapshot(query(collection(db, 'claims'), where('uid', '==', uid)), snap => cb(snap.docs.map(d => { const x = d.data(); return { id: d.id, type: 'claim', title: x.offerBrand, amount: -x.pointsSpent, timestamp: x.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(), code: x.code, rewardType: x.code ? 'code' : 'link' } as Transaction; })), err => { handleFsError(err, 'claims', false); cb([]); }); },
  onHistoryChange(uid: string, cb: (history: Transaction[]) => void) { if (!db) { cb([]); return () => {}; } return onSnapshot(query(collection(db, 'history'), where('uid', '==', uid)), snap => cb(snap.docs.map(d => { const x = d.data(); return { id: d.id, type: 'earn', title: x.title || x.message, amount: x.amount || x.points, timestamp: x.timestamp?.toDate?.()?.toISOString() || new Date().toISOString() } as Transaction; })), err => { handleFsError(err, 'history', false); cb([]); }); },

  async claimOffer(uid: string, offer: Offer) {
    if (!db) throw new Error("Firestore not initialized");
    const userRef = doc(db, getCol(uid), uid); const claimRef = doc(collection(db, 'claims'));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef); if (!snap.exists()) throw new Error("User not found"); const u = snap.data() as UserProfile;
      if (u.points < offer.points) throw new Error("Insufficient points");
      tx.update(userRef, { points: Number(u.points) - Number(offer.points), claimsToday: (Number(u.claimsToday) || 0) + 1, lastClaimDate: new Date().toISOString() });
      tx.set(doc(collection(db, 'history')), { uid, type: 'claim', points: -Number(offer.points), message: `Claimed ${offer.brand}`, timestamp: serverTimestamp() });
      tx.set(claimRef, { uid, offerId: offer.id, offerBrand: offer.brand, code: offer.code || null, url: offer.url, pointsSpent: offer.points, timestamp: serverTimestamp() });
    });
    return true;
  },
};

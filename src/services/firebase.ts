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

const PRODUCTION_WEB_CLIENT_ID = "563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com";

// ═══════════════════════════════════════════════════════════════════════
// GoogleAuth as awaitable singleton
//
// ROOT CAUSE OF AUTH FAILURE: Three compounding issues:
//   1. fire-and-forget import().then() — if user taps Sign In before
//      the dynamic import resolves, GoogleAuthInstance is null → crash.
//   2. grantOfflineAccess: true — requests a server authorization code
//      that requires a backend server to exchange. RewardHub has no backend.
//   3. clientId set to Web Client ID — on Android, clientId should come
//      from google-services.json, NOT be explicitly set. Only serverClientId
//      should be set (to get the idToken for Firebase credential exchange).
//
// FIX: ensureGoogleAuth() returns a Promise. signInWithGoogle() awaits it.
//   grantOfflineAccess set to false. clientId removed (let google-services.json handle it).
// ═══════════════════════════════════════════════════════════════════════
let googleAuthPromise: Promise<any> | null = null;

function ensureGoogleAuth(): Promise<any> {
  if (googleAuthPromise) return googleAuthPromise;
  
  googleAuthPromise = (async () => {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      (GoogleAuth as any).initialize({
        serverClientId: PRODUCTION_WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: false
      });
      console.log("[GoogleAuth] Initialized with serverClientId only");
      return GoogleAuth;
    } catch (error) {
      console.error("[GoogleAuth] Init failed:", error);
      return null;
    }
  })();
  
  return googleAuthPromise;
}

// Start eagerly (non-blocking)
if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  ensureGoogleAuth();
}

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
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
  console.error("Firebase init failed:", error);
}

const db = app ? initializeFirestore(app, { experimentalForceLongPolling: true }) : null;
const auth = app ? getAuth(app) : null;
const googleProvider = new GoogleAuthProvider();
const webClientId = import.meta.env.VITE_FIREBASE_WEB_CLIENT_ID || PRODUCTION_WEB_CLIENT_ID;
if (webClientId) googleProvider.setCustomParameters({ client_id: webClientId });

export { auth, googleProvider, db };
export type { FirebaseUser };

enum Op { CREATE='create', UPDATE='update', DELETE='delete', LIST='list', GET='get', WRITE='write' }

function handleFsError(error: unknown, op: Op, path: string | null, shouldThrow = true) {
  console.error('Firestore Error:', { error: error instanceof Error ? error.message : String(error), op, path, uid: auth?.currentUser?.uid });
  if (shouldThrow) throw error;
}

function getCol(uid: string) { return uid.startsWith('local_guest_') ? 'guests' : 'users'; }

export const firebaseService = {
  // ─── AUTH ────────────────────────────────────────────────────────
  async signInWithGoogle() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    try {
      if (Capacitor.isNativePlatform()) {
        console.log("[Auth] Native — awaiting GoogleAuth singleton");
        const plugin = await ensureGoogleAuth();
        if (!plugin) throw new Error("GoogleAuth plugin failed to load");
        
        const googleUser = await plugin.signIn();
        console.log("[Auth] GoogleAuth.signIn() returned:", googleUser.email);
        
        const idToken = googleUser.authentication?.idToken || (googleUser as any).idToken;
        if (!idToken) {
          console.error("[Auth] No idToken. Response keys:", Object.keys(googleUser));
          throw new Error("No ID Token. Verify: SHA-1 in Firebase, server_client_id in strings.xml, re-download google-services.json");
        }
        
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        await this._ensureProfile(result.user);
        return result.user;
      }
      
      const result = await signInWithPopup(auth, googleProvider);
      await this._ensureProfile(result.user);
      return result.user;
    } catch (error) {
      console.error("[Auth] signInWithGoogle failed:", error);
      throw error;
    }
  },

  async signInAnonymously() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    const result = await signInAnonymously(auth);
    await this._ensureProfile(result.user, 'Guest User');
    return result.user;
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

  async logout() { if (auth) await signOut(auth); },
  async deleteAccount() { if (auth?.currentUser) await deleteUser(auth.currentUser); },
  async deleteUserProfile(uid: string) { if (db) await deleteDoc(doc(db, getCol(uid), uid)); },
  onAuthChange(cb: (user: FirebaseUser | null) => void) { if (!auth) { cb(null); return () => {}; } return onAuthStateChanged(auth, cb); },

  // ─── PROFILE ─────────────────────────────────────────────────────
  onProfileChange(uid: string, cb: (p: UserProfile | null) => void) {
    if (!db) { cb(null); return () => {}; }
    return onSnapshot(doc(db, getCol(uid), uid), d => cb(d.exists() ? d.data() as UserProfile : null),
      err => { handleFsError(err, Op.GET, `${getCol(uid)}/${uid}`, false); cb(null); });
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!db) return null;
    try {
      const d = await getDoc(doc(db, getCol(uid), uid));
      if (d.exists()) { const p = d.data() as UserProfile; localStorage.setItem(`profile_${uid}`, JSON.stringify(p)); return p; }
      const c = localStorage.getItem(`profile_${uid}`);
      return c ? JSON.parse(c) : null;
    } catch { const c = localStorage.getItem(`profile_${uid}`); return c ? JSON.parse(c) : null; }
  },

  async saveUserProfile(profile: UserProfile) {
    if (!db) return;
    try { await setDoc(doc(db, getCol(profile.uid), profile.uid), profile, { merge: true }); localStorage.setItem(`profile_${profile.uid}`, JSON.stringify(profile)); }
    catch (e) { handleFsError(e, Op.WRITE, `${getCol(profile.uid)}/${profile.uid}`, false); }
  },

  async checkDailyReset(uid: string) {
    if (!db) return;
    if (!uid.startsWith('local_guest_') && (!auth || !auth.currentUser)) return;
    try {
      const d = await getDoc(doc(db, getCol(uid), uid));
      if (d.exists() && d.data().lastBoostDate !== new Date().toDateString()) {
        await setDoc(doc(db, getCol(uid), uid), { boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString() }, { merge: true });
      }
    } catch (e) { handleFsError(e, Op.GET, `${getCol(uid)}/${uid}`, false); }
  },

  // ═══════════════════════════════════════════════════════════════════
  // recordAdWatch — WITH BOUNDS GUARD
  //
  // ROOT CAUSE OF "5/3": currentLevelAdCounter += 1 with NO cap check.
  // The modal loop called onReward() repeatedly past the boost level.
  // FIX: Refuse to increment if counter >= boostLevel.
  // ═══════════════════════════════════════════════════════════════════
  async recordAdWatch(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    const col = getCol(uid);
    const userRef = doc(db, col, uid);
    const today = new Date().toDateString();

    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      let d: any;
      if (!snap.exists()) {
        d = { uid, points: 0, totalEarned: 0, boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: today, email: auth?.currentUser?.email || 'Unknown' };
        tx.set(userRef, d);
      } else {
        d = snap.data();
      }

      let boostLevel = Number(d.boostLevel) || 1;
      let currentLevelAdCounter = Number(d.currentLevelAdCounter) || 0;
      let lastBoostDate = d.lastBoostDate || null;

      if (lastBoostDate !== today) { boostLevel = 1; currentLevelAdCounter = 0; lastBoostDate = today; }

      const adsNeeded = boostLevel;

      // BOUNDS GUARD: Do not exceed boost level
      if (currentLevelAdCounter >= adsNeeded) {
        return { boostLevel, currentLevelAdCounter, adsNeeded, isLocalGuest: uid.startsWith('local_guest_') };
      }

      currentLevelAdCounter += 1;
      tx.set(userRef, { currentLevelAdCounter, lastBoostDate: today }, { merge: true });

      return { boostLevel, currentLevelAdCounter, adsNeeded, isLocalGuest: uid.startsWith('local_guest_') };
    });
  },

  async claimBoostReward(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    const col = getCol(uid);
    const userRef = doc(db, col, uid);
    const historyRef = doc(collection(db, 'history'));
    const today = new Date().toDateString();

    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("User not found");
      const d = snap.data();
      let boostLevel = Number(d.boostLevel) || 1;
      let currentLevelAdCounter = Number(d.currentLevelAdCounter) || 0;
      let adsWatchedToday = Number(d.adsWatchedToday) || 0;
      let points = Number(d.points) || 0;
      let totalEarned = Number(d.totalEarned) || 0;

      if (currentLevelAdCounter < boostLevel) throw new Error("Boost requirement not met");

      points += 100; totalEarned += 100;
      const completedLevel = boostLevel;
      boostLevel += 1; adsWatchedToday += 1; currentLevelAdCounter = 0;

      tx.set(userRef, { points, totalEarned, boostLevel, adsWatchedToday, currentLevelAdCounter, lastBoostDate: today }, { merge: true });
      tx.set(historyRef, { uid, type: 'earn', points: 100, message: `Completed Boost Level ${completedLevel}`, timestamp: serverTimestamp() });

      return { points, boostLevel };
    });
  },

  // ─── LISTENERS ───────────────────────────────────────────────────
  onOffersChange(cb: (offers: Offer[]) => void) {
    if (!db) { cb([]); return () => {}; }
    return onSnapshot(query(collection(db, 'offers')),
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data(), points: Number(d.data().points || 0) } as Offer))),
      err => { handleFsError(err, Op.LIST, 'offers', false); cb([]); });
  },

  onClaimsChange(uid: string, cb: (claims: Transaction[]) => void) {
    if (!db) { cb([]); return () => {}; }
    return onSnapshot(query(collection(db, 'claims'), where('uid', '==', uid)),
      snap => cb(snap.docs.map(d => {
        const x = d.data();
        return { id: d.id, type: 'claim', title: x.offerBrand, amount: -x.pointsSpent,
          timestamp: x.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
          code: x.code, rewardType: x.code ? 'code' : 'link' } as Transaction;
      })),
      err => { handleFsError(err, Op.LIST, 'claims', false); cb([]); });
  },

  onHistoryChange(uid: string, cb: (history: Transaction[]) => void) {
    if (!db) { cb([]); return () => {}; }
    return onSnapshot(query(collection(db, 'history'), where('uid', '==', uid)),
      snap => cb(snap.docs.map(d => {
        const x = d.data();
        return { id: d.id, type: 'earn', title: x.title || x.message, amount: x.amount || x.points,
          timestamp: x.timestamp?.toDate?.()?.toISOString() || new Date().toISOString() } as Transaction;
      })),
      err => { handleFsError(err, Op.LIST, 'history', false); cb([]); });
  },

  async claimOffer(uid: string, offer: Offer) {
    if (!db) throw new Error("Firestore not initialized");
    const userRef = doc(db, getCol(uid), uid);
    const claimRef = doc(collection(db, 'claims'));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("User not found");
      const u = snap.data() as UserProfile;
      if (u.points < offer.points) throw new Error("Insufficient points");
      tx.update(userRef, { points: Number(u.points) - Number(offer.points), claimsToday: (Number(u.claimsToday) || 0) + 1, lastClaimDate: new Date().toISOString() });
      tx.set(doc(collection(db, 'history')), { uid, type: 'claim', points: -Number(offer.points), message: `Claimed ${offer.brand}`, timestamp: serverTimestamp() });
      tx.set(claimRef, { uid, offerId: offer.id, offerBrand: offer.brand, code: offer.code || null, url: offer.url, pointsSpent: offer.points, timestamp: serverTimestamp() });
    });
    return true;
  },
};

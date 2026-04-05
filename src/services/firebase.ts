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
// v10: GoogleAuth as awaitable singleton
// OLD BUG: fire-and-forget import().then() raced with signIn() calls.
//   If user tapped "Sign In" before the import resolved, GoogleAuthInstance
//   was null → crash. Also grantOfflineAccess:true requested a server
//   auth code that requires a backend to exchange.
// FIX: ensureGoogleAuth() returns a promise. signInWithGoogle() awaits it.
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
        grantOfflineAccess: false  // v10: was true — caused server-code-only response
      });
      console.log("[GoogleAuth] Initialized with serverClientId");
      return GoogleAuth;
    } catch (error) {
      console.error("[GoogleAuth] Init failed:", error);
      return null;
    }
  })();
  
  return googleAuthPromise;
}

// Eagerly start import (non-blocking)
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
  console.log("[Firebase] Initialized");
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

enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, shouldThrow = true) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: { userId: auth?.currentUser?.uid, email: auth?.currentUser?.email, isAnonymous: auth?.currentUser?.isAnonymous },
    operationType, path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  if (shouldThrow) throw new Error(JSON.stringify(errInfo));
}

export const firebaseService = {
  async signInWithGoogle() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    try {
      if (Capacitor.isNativePlatform()) {
        console.log("[Auth] Native — awaiting GoogleAuth singleton");
        const GoogleAuthPlugin = await ensureGoogleAuth();
        if (!GoogleAuthPlugin) throw new Error("GoogleAuth plugin failed to initialize.");
        
        console.log("[Auth] Calling GoogleAuth.signIn()...");
        const googleUser = await GoogleAuthPlugin.signIn();
        console.log("[Auth] signIn() success:", googleUser.email);
        
        const idToken = googleUser.authentication?.idToken || (googleUser as any).idToken;
        if (!idToken) {
          console.error("[Auth] No idToken. Keys:", JSON.stringify(Object.keys(googleUser)));
          throw new Error("No ID Token. Check: 1) SHA-1 in Firebase 2) server_client_id in strings.xml 3) Re-download google-services.json");
        }
        
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        console.log("[Auth] Firebase credential success:", result.user.uid);
        
        const profile = await this.getUserProfile(result.user.uid);
        if (!profile) {
          await this.saveUserProfile({
            uid: result.user.uid, email: result.user.email || 'Google User',
            points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0,
            boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString()
          });
        }
        return result.user;
      }
      
      // Web: popup
      console.log("[Auth] Web — using signInWithPopup");
      const result = await signInWithPopup(auth, googleProvider);
      const profile = await this.getUserProfile(result.user.uid);
      if (!profile) {
        await this.saveUserProfile({
          uid: result.user.uid, email: result.user.email || 'Google User',
          points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0,
          boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString()
        });
      }
      return result.user;
    } catch (error: any) {
      console.error("[Auth] Google Sign-In failed:", error);
      throw error;
    }
  },

  async signInAnonymously() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    const result = await signInAnonymously(auth);
    const profile = await this.getUserProfile(result.user.uid);
    if (!profile) {
      await this.saveUserProfile({
        uid: result.user.uid, email: 'Guest User',
        points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0,
        boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString()
      });
    }
    return result.user;
  },

  async logout() { if (auth) await signOut(auth); },
  async deleteAccount() { if (auth?.currentUser) await deleteUser(auth.currentUser); },

  async deleteUserProfile(uid: string) {
    if (!db) return;
    const col = uid.startsWith('local_guest_') ? 'guests' : 'users';
    await deleteDoc(doc(db, col, uid));
  },

  onAuthChange(callback: (user: FirebaseUser | null) => void) {
    if (!auth) { callback(null); return () => {}; }
    return onAuthStateChanged(auth, callback);
  },

  onProfileChange(uid: string, callback: (profile: UserProfile | null) => void) {
    if (!db) { callback(null); return () => {}; }
    const col = uid.startsWith('local_guest_') ? 'guests' : 'users';
    return onSnapshot(doc(db, col, uid),
      (d) => callback(d.exists() ? d.data() as UserProfile : null),
      (err) => { handleFirestoreError(err, OperationType.GET, `${col}/${uid}`, false); callback(null); }
    );
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!db) return null;
    const col = uid.startsWith('local_guest_') ? 'guests' : 'users';
    try {
      const d = await getDoc(doc(db, col, uid));
      if (d.exists()) {
        const profile = d.data() as UserProfile;
        localStorage.setItem(`profile_${uid}`, JSON.stringify(profile));
        return profile;
      }
      const cached = localStorage.getItem(`profile_${uid}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      const cached = localStorage.getItem(`profile_${uid}`);
      return cached ? JSON.parse(cached) : null;
    }
  },

  async saveUserProfile(profile: UserProfile) {
    if (!db) return;
    const col = profile.uid.startsWith('local_guest_') ? 'guests' : 'users';
    try {
      await setDoc(doc(db, col, profile.uid), profile, { merge: true });
      localStorage.setItem(`profile_${profile.uid}`, JSON.stringify(profile));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${col}/${profile.uid}`, false);
    }
  },

  async checkDailyReset(uid: string) {
    if (!db) return;
    const isGuest = uid.startsWith('local_guest_');
    const col = isGuest ? 'guests' : 'users';
    if (!isGuest && (!auth || !auth.currentUser)) return;
    try {
      const d = await getDoc(doc(db, col, uid));
      if (d.exists() && d.data().lastBoostDate !== new Date().toDateString()) {
        await setDoc(doc(db, col, uid), {
          boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString()
        }, { merge: true });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${col}/${uid}`, false);
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // v10: recordAdWatch — BOUNDS GUARD added
  // OLD BUG: currentLevelAdCounter += 1 with NO cap check.
  //   The "Watch Next Ad" loop in AdSimulatorModal called onReward()
  //   repeatedly, incrementing past boostLevel → showed "5/3".
  // FIX: Refuse to increment if counter >= boostLevel.
  // ═══════════════════════════════════════════════════════════════════
  async recordAdWatch(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    const isGuest = uid.startsWith('local_guest_');
    const col = isGuest ? 'guests' : 'users';
    const userRef = doc(db, col, uid);
    const today = new Date().toDateString();

    try {
      return await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        let userData: any;
        if (!userDoc.exists()) {
          userData = { uid, points: 0, totalEarned: 0, boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: today, email: auth?.currentUser?.email || (isGuest ? 'Guest User' : 'Unknown') };
          transaction.set(userRef, userData);
        } else {
          userData = userDoc.data();
        }

        let boostLevel = Number(userData.boostLevel) || 1;
        let adsWatchedToday = Number(userData.adsWatchedToday) || 0;
        let currentLevelAdCounter = Number(userData.currentLevelAdCounter) || 0;
        let lastBoostDate = userData.lastBoostDate || null;

        if (lastBoostDate !== today) {
          boostLevel = 1; adsWatchedToday = 0; currentLevelAdCounter = 0; lastBoostDate = today;
        }

        const adsNeeded = boostLevel;

        // ── v10 BOUNDS GUARD: Stop at cap ──
        if (currentLevelAdCounter >= adsNeeded) {
          return { isLocalGuest: isGuest, rewardClaimed: false, boostLevel, adsWatchedToday, currentLevelAdCounter, adsNeeded };
        }

        currentLevelAdCounter += 1;
        transaction.set(userRef, { currentLevelAdCounter, lastBoostDate: today }, { merge: true });

        return { isLocalGuest: isGuest, rewardClaimed: false, boostLevel, adsWatchedToday, currentLevelAdCounter, adsNeeded };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'ad_watch');
      throw error;
    }
  },

  async claimBoostReward(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    const isGuest = uid.startsWith('local_guest_');
    const col = isGuest ? 'guests' : 'users';
    const userRef = doc(db, col, uid);
    const historyRef = doc(collection(db, 'history'));
    const today = new Date().toDateString();

    try {
      return await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User not found");
        const d = userDoc.data();
        let boostLevel = Number(d.boostLevel) || 1;
        let currentLevelAdCounter = Number(d.currentLevelAdCounter) || 0;
        let adsWatchedToday = Number(d.adsWatchedToday) || 0;
        let points = Number(d.points) || 0;
        let totalEarned = Number(d.totalEarned) || 0;

        if (currentLevelAdCounter < boostLevel) throw new Error("Boost requirement not met");

        points += 100; totalEarned += 100;
        const completedLevel = boostLevel;
        boostLevel += 1; adsWatchedToday += 1; currentLevelAdCounter = 0;

        transaction.set(userRef, { points, totalEarned, boostLevel, adsWatchedToday, currentLevelAdCounter, lastBoostDate: today }, { merge: true });
        transaction.set(historyRef, { uid, type: 'earn', points: 100, message: `Completed Boost Level ${completedLevel}`, timestamp: serverTimestamp() });

        return { points, boostLevel };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'claim_boost');
      throw error;
    }
  },

  onOffersChange(callback: (offers: Offer[]) => void) {
    if (!db) { callback([]); return () => {}; }
    return onSnapshot(query(collection(db, 'offers')),
      (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data(), points: Number(d.data().points || 0) } as Offer))),
      (err) => { handleFirestoreError(err, OperationType.LIST, 'offers', false); callback([]); }
    );
  },

  onClaimsChange(uid: string, callback: (claims: Transaction[]) => void) {
    if (!db) { callback([]); return () => {}; }
    return onSnapshot(query(collection(db, 'claims'), where('uid', '==', uid)),
      (snap) => callback(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, type: 'claim', title: data.offerBrand, amount: -data.pointsSpent,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
          code: data.code, rewardType: data.code ? 'code' : 'link' } as Transaction;
      })),
      (err) => { handleFirestoreError(err, OperationType.LIST, 'claims', false); callback([]); }
    );
  },

  onHistoryChange(uid: string, callback: (history: Transaction[]) => void) {
    if (!db) { callback([]); return () => {}; }
    return onSnapshot(query(collection(db, 'history'), where('uid', '==', uid)),
      (snap) => callback(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, type: 'earn', title: data.title || data.message, amount: data.amount || data.points,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString() } as Transaction;
      })),
      (err) => { handleFirestoreError(err, OperationType.LIST, 'history', false); callback([]); }
    );
  },

  async claimOffer(uid: string, offer: Offer) {
    if (!db) throw new Error("Firestore not initialized");
    const col = uid.startsWith('local_guest_') ? 'guests' : 'users';
    const userRef = doc(db, col, uid);
    const claimRef = doc(collection(db, 'claims'));
    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User profile not found");
        const userData = userDoc.data() as UserProfile;
        if (userData.points < offer.points) throw new Error("Insufficient points");
        transaction.update(userRef, { points: Number(userData.points) - Number(offer.points), claimsToday: (Number(userData.claimsToday) || 0) + 1, lastClaimDate: new Date().toISOString() });
        const historyRef = doc(collection(db, 'history'));
        transaction.set(historyRef, { uid, type: 'claim', points: -Number(offer.points), message: `Claimed ${offer.brand}`, timestamp: serverTimestamp() });
        transaction.set(claimRef, { uid, offerId: offer.id, offerBrand: offer.brand, code: offer.code || null, url: offer.url, pointsSpent: offer.points, timestamp: serverTimestamp() });
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'claim');
      throw error;
    }
  },

  async rewardUserPoints(uid: string, points: number, title: string) {
    if (!db) throw new Error("Firestore not initialized");
    const col = uid.startsWith('local_guest_') ? 'guests' : 'users';
    const userRef = doc(db, col, uid);
    const historyRef = doc(collection(db, 'history'));
    await setDoc(userRef, { uid, points: 0, totalEarned: 0 }, { merge: true });
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) throw new Error("User profile not found");
      const userData = userDoc.data() as UserProfile;
      transaction.update(userRef, { points: (userData.points || 0) + points, totalEarned: (userData.totalEarned || 0) + points });
      transaction.set(historyRef, { uid, type: 'earn', title, amount: points, timestamp: serverTimestamp() });
    });
    return true;
  },
};

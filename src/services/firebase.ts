import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeFirestore,
  collection,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInAnonymously,
  deleteUser,
  User as FirebaseUser,
  signInWithCredential
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { Offer, UserProfile, Transaction } from '../types';

// Hardcoded Client ID for Native Auth
const PRODUCTION_WEB_CLIENT_ID = "563861371307-3moj6n7qanfg0tgn1vrv8ok59rnh8pj2.apps.googleusercontent.com";

// Initialize Google Auth for Capacitor
if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
    try {
      (GoogleAuth as any).initialize({
        clientId: PRODUCTION_WEB_CLIENT_ID,
        serverClientId: PRODUCTION_WEB_CLIENT_ID,
        androidClientId: PRODUCTION_WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
        redirectUri: "https://rewardhub-1ea27.firebaseapp.com/__/auth/handler"
      });
      console.log("GoogleAuth initialized successfully");
    } catch (error) {
      console.warn("GoogleAuth.initialize failed:", error);
    }
  }).catch(err => {
    console.warn("Failed to load GoogleAuth plugin:", err);
  });
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAs-some-key-here", 
  authDomain: "rewardhub-1ea27.firebaseapp.com",
  projectId: "rewardhub-1ea27",
  storageBucket: "rewardhub-1ea27.appspot.com",
  messagingSenderId: "563861371307",
  appId: "1:563861371307:android:02f4cdfdbe8b17a247aee",
};

// Check if config is valid
export const isConfigValid = true; // Hardcoded to true since we are providing the config

// Initialize Firebase
let app;
try {
  if (isConfigValid) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  } else {
    console.error("Firebase configuration is missing or incomplete. Please check your environment variables.");
    // Fallback or dummy app if needed, but better to handle in components
  }
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
}

// Initialize Firestore with settings for better connectivity in restricted environments
const db = app ? initializeFirestore(app, {
  experimentalForceLongPolling: true,
}) : null;

// Initialize Auth
const auth = app ? getAuth(app) : null;
const googleProvider = new GoogleAuthProvider();

// Production Credentials for Google Play
// SHA-1 (App Signing): 56:FB:BC:58:9D:88:6D:B9:09:D4:95:8E:42:2C:D6:AC:5A:F0:A9:4E
// SHA-1 (Upload): 30:F6:0A:82:AD:F4:9C:5F:0F:9C:01:9B:39:8D:1E:C0:66:8E:F5:A9

// If a Web Client ID is provided, set it. This is often required for 
// Google Sign-In to work correctly on Android/iOS in hybrid apps.
const webClientId = import.meta.env.VITE_FIREBASE_WEB_CLIENT_ID || PRODUCTION_WEB_CLIENT_ID;
if (webClientId) {
  googleProvider.setCustomParameters({
    client_id: webClientId
  });
}

export { auth, googleProvider };
export type { FirebaseUser };

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firebaseService = {
  async signInWithGoogle() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    try {
      // Try Native Google Auth first if on native platform
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        
        // Ensure initialization with hardcoded production Client ID
        try {
          await (GoogleAuth as any).initialize({
            clientId: PRODUCTION_WEB_CLIENT_ID,
            serverClientId: PRODUCTION_WEB_CLIENT_ID,
            androidClientId: PRODUCTION_WEB_CLIENT_ID,
            scopes: ['profile', 'email'],
            grantOfflineAccess: true,
          });
        } catch (initError) {
          console.warn("GoogleAuth.initialize error (might already be initialized):", initError);
        }

        const googleUser = await GoogleAuth.signIn();
        const idToken = googleUser.authentication.idToken;
        
        if (!idToken) {
          throw new Error("No ID Token received from Google Auth. Please ensure your SHA-1 is registered in Firebase.");
        }
        
        // Version 7.4.0: Use GoogleAuthProvider.credential(idToken) to sign into Firebase
        // This is the ONLY way to fix 'Invalid Action' on Android.
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        return result.user;
      }
      
      // On web, use popup
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error) {
      console.error("Google Auth failed:", error);
      throw error;
    }
  },

  async signInAnonymously() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    try {
      const result = await signInAnonymously(auth);
      return result.user;
    } catch (error) {
      console.error("Error signing in anonymously:", error);
      throw error;
    }
  },

  async logout() {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  },

  async deleteAccount() {
    if (!auth || !auth.currentUser) return;
    try {
      await deleteUser(auth.currentUser);
    } catch (error) {
      console.error("Error deleting auth account:", error);
      throw error;
    }
  },

  async deleteUserProfile(uid: string) {
    if (!db) return;
    const collectionName = uid.startsWith('local_guest_') ? 'guests' : 'users';
    try {
      await deleteDoc(doc(db, collectionName, uid));
    } catch (error) {
      console.error("Error deleting user profile:", error);
      throw error;
    }
  },

  onAuthChange(callback: (user: FirebaseUser | null) => void) {
    if (!auth) {
      callback(null);
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  },

  onProfileChange(uid: string, callback: (profile: UserProfile | null) => void) {
    if (!db) {
      callback(null);
      return () => {};
    }
    const collectionName = uid.startsWith('local_guest_') ? 'guests' : 'users';
    return onSnapshot(doc(db, collectionName, uid), (doc) => {
      if (doc.exists()) {
        callback(doc.data() as UserProfile);
      } else {
        callback(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${uid}`);
      callback(null);
    });
  },

  onOffersChange(callback: (offers: Offer[]) => void) {
    if (!db) {
      callback([]);
      return () => {};
    }
    
    // Version 7.4.0: Fetch ALL offers once and filter client-side for stability
    // This fixes the 'Disappearing Offers' and 'Firestore Index' issues forever.
    const q = query(collection(db, 'offers'));

    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        console.log(`[DEBUG] Firestore 'offers' collection is empty`);
      }
      const offers = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          points: Number(data.points || 0)
        } as Offer;
      });
      callback(offers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'offers');
      callback([]);
    });
  },

  onClaimsChange(uid: string, callback: (claims: Transaction[]) => void) {
    if (!db) {
      callback([]);
      return () => {};
    }
    const q = query(
      collection(db, 'claims'),
      where('userId', '==', uid)
    );
    
    return onSnapshot(q, (snapshot) => {
      const claims = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            type: 'claim',
            title: data.offerBrand,
            amount: -data.pointsSpent,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
            code: data.code,
            rewardType: data.code ? 'code' : 'link'
          } as Transaction;
        });
      callback(claims);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'claims');
      callback([]);
    });
  },

  onHistoryChange(uid: string, callback: (history: Transaction[]) => void) {
    if (!db) {
      callback([]);
      return () => {};
    }
    const q = query(
      collection(db, 'history'), 
      where('userId', '==', uid)
    );
    
    return onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'earn',
          title: data.title,
          amount: data.amount,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
        } as Transaction;
      });
      callback(history);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'history');
      callback([]);
    });
  },

  async rewardUserPoints(uid: string, points: number, title: string) {
    if (!db) throw new Error("Firestore not initialized");
    
    const collectionName = uid.startsWith('local_guest_') ? 'guests' : 'users';
    const userRef = doc(db, collectionName, uid);
    const historyRef = doc(collection(db, 'history'));

    try {
      // Ensure user document exists first using setDoc with merge: true
      await setDoc(userRef, { uid, points: 0, totalEarned: 0 }, { merge: true });

      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error("User profile not found");
        }

        const userData = userDoc.data() as UserProfile;
        
        // Update user points
        transaction.update(userRef, {
          points: (userData.points || 0) + points,
          totalEarned: (userData.totalEarned || 0) + points
        });

        // Record history
        transaction.set(historyRef, {
          userId: uid,
          type: 'earn',
          title: title,
          amount: points,
          timestamp: serverTimestamp()
        });
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'history');
      throw error;
    }
  },

  async recordAdWatch(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    
    const isGuest = uid.startsWith('local_guest_');
    const collectionName = isGuest ? 'guests' : 'users';
    const userRef = doc(db, collectionName, uid);
    const historyRef = doc(collection(db, 'history'));
    const today = new Date().toDateString();

    try {
      // Ensure user document exists first using setDoc with merge: true
      // This is a critical fix for Android APK to ensure points are saved
      const initialProfile: Partial<UserProfile> = {
        uid,
        points: 0,
        totalEarned: 0,
        boostLevel: 1,
        adsWatchedToday: 0,
        lastBoostDate: today
      };
      await setDoc(userRef, initialProfile, { merge: true });

      return await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error("User profile not found even after creation");
        }

        const userData = userDoc.data() as UserProfile;
        let boostLevel = userData.boostLevel || 1;
        let adsWatchedToday = userData.adsWatchedToday || 0;
        const lastBoostDate = userData.lastBoostDate || null;

        // Daily Reset Check (1, 2, 3 progression)
        if (lastBoostDate !== today) {
          boostLevel = 1;
          adsWatchedToday = 0;
        }

        adsWatchedToday += 1;
        const adsNeeded = boostLevel; // Level 1 needs 1, Level 2 needs 2, Level 3 needs 3

        let rewardClaimed = false;
        let updatedPoints = userData.points || 0;
        let updatedTotalEarned = userData.totalEarned || 0;

        if (adsWatchedToday >= adsNeeded) {
          const rewardAmount = 100;
          updatedPoints += rewardAmount;
          updatedTotalEarned += rewardAmount;
          
          boostLevel += 1;
          adsWatchedToday = 0;
          rewardClaimed = true;

          transaction.set(historyRef, {
            userId: uid,
            type: 'earn',
            title: `Daily Boost (Level ${boostLevel - 1})`,
            amount: rewardAmount,
            timestamp: serverTimestamp()
          });
        }

        transaction.update(userRef, {
          points: updatedPoints,
          totalEarned: updatedTotalEarned,
          boostLevel,
          adsWatchedToday,
          lastBoostDate: today
        });

        return {
          rewardClaimed,
          boostLevel,
          adsWatchedToday,
          adsNeeded: boostLevel
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'ad_watch');
      throw error;
    }
  },

  async claimOffer(uid: string, offer: Offer) {
    if (!db) throw new Error("Firestore not initialized");
    
    const collectionName = uid.startsWith('local_guest_') ? 'guests' : 'users';
    const userRef = doc(db, collectionName, uid);
    const claimRef = doc(collection(db, 'claims'));

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error("User profile not found");
        }

        const userData = userDoc.data() as UserProfile;
        if (userData.points < offer.points) {
          throw new Error("Insufficient points");
        }

        // Deduct points
        transaction.update(userRef, {
          points: userData.points - offer.points,
          claimsToday: (userData.claimsToday || 0) + 1,
          totalEarned: (userData.totalEarned || 0) + 1,
          lastClaimDate: new Date().toISOString()
        });

        // Record claim
        transaction.set(claimRef, {
          userId: uid,
          offerId: offer.id,
          offerBrand: offer.brand,
          code: offer.code || null,
          url: offer.url,
          pointsSpent: offer.points,
          timestamp: serverTimestamp()
        });
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'claim');
      throw error;
    }
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!db) return null;
    const collectionName = uid.startsWith('local_guest_') ? 'guests' : 'users';
    try {
      const userDoc = await getDoc(doc(db, collectionName, uid));
      if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${uid}`);
      return null;
    }
  },

  async saveUserProfile(profile: UserProfile) {
    if (!db) return;
    const collectionName = profile.uid.startsWith('local_guest_') ? 'guests' : 'users';
    try {
      await setDoc(doc(db, collectionName, profile.uid), profile, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${profile.uid}`);
    }
  }
};

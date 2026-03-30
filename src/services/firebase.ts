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
      // Version 7.6.1: Simplified initialization for better compatibility
      // We use the Web Client ID for both clientId and serverClientId on Android/iOS
      (GoogleAuth as any).initialize({
        clientId: PRODUCTION_WEB_CLIENT_ID,
        serverClientId: PRODUCTION_WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true
      });
      console.log("[DEBUG] GoogleAuth initialized successfully with Client ID:", PRODUCTION_WEB_CLIENT_ID);
    } catch (error) {
      console.error("[DEBUG] GoogleAuth.initialize failed:", error);
    }
  }).catch(err => {
    console.error("[DEBUG] Failed to load GoogleAuth plugin:", err);
  });
}

const firebaseConfig = {
  apiKey: 'AIzaSyBL1efWEa3WHUSPD0_sDTvpCTqIIImh5X6Y',
  authDomain: 'rewardhub-1ea27.firebaseapp.com',
  projectId: 'rewardhub-1ea27',
  storageBucket: 'rewardhub-1ea27.firebasestorage.app',
  messagingSenderId: '563861371307',
  appId: '1:563861371307:web:7db5542c5b2f2e46247aee'
};

// Check if config is valid
export const isConfigValid = true; // Hardcoded to true since we are providing the config

// Initialize Firebase
let app;
try {
  if (isConfigValid) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    console.log("[DEBUG] Firebase initialized successfully");
  } else {
    console.error("Firebase configuration is missing or incomplete. Please check your environment variables.");
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

// If a Web Client ID is provided, set it.
const webClientId = import.meta.env.VITE_FIREBASE_WEB_CLIENT_ID || PRODUCTION_WEB_CLIENT_ID;
if (webClientId) {
  googleProvider.setCustomParameters({
    client_id: webClientId
  });
}

export { auth, googleProvider, db };
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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, shouldThrow = true) {
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
  if (shouldThrow) {
    throw new Error(JSON.stringify(errInfo));
  }
}

export const firebaseService = {
  async signInWithGoogle() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    try {
      console.log("[DEBUG] signInWithGoogle started");
      // Try Native Google Auth first if on native platform
      if (Capacitor.isNativePlatform()) {
        console.log("[DEBUG] Native platform detected, using GoogleAuth plugin");
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        
        console.log("[DEBUG] Calling GoogleAuth.signIn()...");
        // Version 7.6.1: Ensure we use the correct client IDs for native
        const googleUser = await GoogleAuth.signIn();
        console.log("[DEBUG] GoogleAuth.signIn success", JSON.stringify({ 
          email: googleUser.email, 
          id: googleUser.id
        }));
        
        const idToken = googleUser.authentication?.idToken;
        if (!idToken) {
          console.error("[DEBUG] Missing idToken in googleUser.authentication");
          throw new Error("No ID Token received. Please check Firebase SHA-1 configuration.");
        }
        
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        console.log("[DEBUG] Firebase signInWithCredential success", result.user.uid);
        return result.user;
      }
      
      // On web, use popup
      console.log("[DEBUG] Web platform detected, using signInWithPopup");
      const result = await signInWithPopup(auth, googleProvider);
      console.log("[DEBUG] Web signInWithPopup success", result.user.uid);
      return result.user;
    } catch (error: any) {
      console.error("[DEBUG] Google Auth failed:", error);
      // Handle 'Requested entity was not found' by resetting key selection if needed
      // (Though here we use hardcoded config, so it's likely a config/SHA-1 issue)
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
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${uid}`, false);
      callback(null);
    });
  },

  onOffersChange(callback: (offers: Offer[]) => void) {
    if (!db) {
      callback([]);
      return () => {};
    }
    
    const q = query(collection(db, 'offers'));

    return onSnapshot(q, (snapshot) => {
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
      handleFirestoreError(error, OperationType.LIST, 'offers', false);
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
      handleFirestoreError(error, OperationType.LIST, 'claims', false);
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
      handleFirestoreError(error, OperationType.LIST, 'history', false);
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

    console.log(`[DEBUG] recordAdWatch started for ${uid} in ${collectionName}`);

    try {
      return await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        
        let userData: any;
        if (!userDoc.exists()) {
          console.log("[DEBUG] User doc does not exist, creating new one");
          userData = {
            uid,
            points: 0,
            totalEarned: 0,
            boostLevel: 1,
            adsWatchedToday: 0,
            lastBoostDate: today,
            email: auth?.currentUser?.email || (isGuest ? 'Guest User' : 'Unknown')
          };
          transaction.set(userRef, userData);
        } else {
          userData = userDoc.data();
          console.log("[DEBUG] User doc exists", JSON.stringify(userData));
        }

        // Ensure numeric types
        let boostLevel = Number(userData.boostLevel || 1);
        let adsWatchedToday = Number(userData.adsWatchedToday || 0);
        let lastBoostDate = userData.lastBoostDate || null;
        let updatedPoints = Number(userData.points || 0);
        let updatedTotalEarned = Number(userData.totalEarned || 0);

        // Daily Reset Check
        if (lastBoostDate !== today) {
          console.log("[DEBUG] Daily reset triggered");
          boostLevel = 1;
          adsWatchedToday = 0;
          lastBoostDate = today;
        }

        // Increment adsWatchedToday
        adsWatchedToday += 1;
        
        const adsNeeded = boostLevel;
        console.log(`[DEBUG] Progress: ${adsWatchedToday}/${adsNeeded} (Level ${boostLevel})`);

        let rewardClaimed = false;
        let pointsEarned = 0;

        // Version 7.6.1: Points (+100 per boost completion)
        if (adsWatchedToday >= adsNeeded) {
          console.log(`[DEBUG] Boost Level ${boostLevel} completed!`);
          pointsEarned = 100;
          updatedPoints += pointsEarned;
          updatedTotalEarned += pointsEarned;
          boostLevel += 1;
          adsWatchedToday = 0; // Reset for next level
          rewardClaimed = true;
        }

        // Record the earn event in history if points were earned
        if (pointsEarned > 0) {
          transaction.set(historyRef, {
            userId: uid,
            type: 'earn',
            title: `Boost Reward (Level ${boostLevel - 1})`,
            amount: pointsEarned,
            timestamp: serverTimestamp()
          });
        }

        const updateData = {
          points: updatedPoints,
          totalEarned: updatedTotalEarned,
          boostLevel,
          adsWatchedToday,
          lastBoostDate: today
        };
        
        console.log("[DEBUG] Updating user doc with", JSON.stringify(updateData));
        transaction.set(userRef, updateData, { merge: true });

        return {
          isLocalGuest: isGuest,
          rewardClaimed,
          boostLevel,
          adsWatchedToday,
          adsNeeded: boostLevel
        };
      });
    } catch (error) {
      console.error("[DEBUG] recordAdWatch failed:", error);
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
          points: Number(userData.points) - Number(offer.points),
          claimsToday: (Number(userData.claimsToday) || 0) + 1,
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

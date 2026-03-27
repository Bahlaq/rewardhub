import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeFirestore,
  collection,
  getDocs,
  query,
  orderBy,
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
  User as FirebaseUser
} from 'firebase/auth';
import { Offer, UserProfile, Transaction } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if config is valid
const isConfigValid = !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

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

// If a Web Client ID is provided, set it. This is often required for 
// Google Sign-In to work correctly on Android/iOS in hybrid apps.
if (import.meta.env.VITE_FIREBASE_WEB_CLIENT_ID) {
  googleProvider.setCustomParameters({
    client_id: import.meta.env.VITE_FIREBASE_WEB_CLIENT_ID
  });
}

export { auth, googleProvider };
export type { FirebaseUser };

export const firebaseService = {
  async signInWithGoogle() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error) {
      console.error("Error signing in with Google:", error);
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
    try {
      await deleteDoc(doc(db, 'users', uid));
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
    if (!db) return () => {};
    return onSnapshot(doc(db, 'users', uid), (doc) => {
      if (doc.exists()) {
        callback(doc.data() as UserProfile);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error("Error listening to user profile:", error);
    });
  },

  onOffersChange(callback: (offers: Offer[]) => void) {
    if (!db) return () => {};
    const q = query(collection(db, 'offers'), orderBy('points', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const offers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Offer));
      callback(offers);
    }, (error) => {
      console.error("Error listening to offers:", error);
    });
  },

  onClaimsChange(uid: string, callback: (claims: Transaction[]) => void) {
    if (!db) return () => {};
    const q = query(
      collection(db, 'claims'), 
      orderBy('timestamp', 'desc')
    );
    // Note: In a real app, you'd filter by userId here, but that requires an index.
    // For now, we'll filter client-side or assume the collection is small/scoped.
    // Actually, let's try to filter by userId if possible.
    // const q = query(collection(db, 'claims'), where('userId', '==', uid), orderBy('timestamp', 'desc'));
    // But that needs an index. Let's stick to a simple query for now.
    
    return onSnapshot(q, (snapshot) => {
      const claims = snapshot.docs
        .map(doc => {
          const data = doc.data();
          if (data.userId !== uid) return null;
          return {
            id: doc.id,
            type: 'claim',
            title: data.offerBrand,
            amount: -data.pointsSpent,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
            code: data.code,
            rewardType: data.code ? 'code' : 'link'
          } as Transaction;
        })
        .filter(Boolean) as Transaction[];
      callback(claims);
    }, (error) => {
      console.error("Error listening to claims:", error);
    });
  },

  async claimOffer(uid: string, offer: Offer) {
    if (!db) throw new Error("Firestore not initialized");
    
    const userRef = doc(db, 'users', uid);
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
      console.error("Error claiming offer:", error);
      throw error;
    }
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!db) return null;
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
  },

  async saveUserProfile(profile: UserProfile) {
    if (!db) return;
    try {
      await setDoc(doc(db, 'users', profile.uid), profile, { merge: true });
    } catch (error) {
      console.error("Error saving user profile:", error);
    }
  }
};

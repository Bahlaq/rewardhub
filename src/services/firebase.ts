import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeFirestore,
  collection,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import { Offer } from '../types';

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
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with settings for better connectivity in restricted environments
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, // Often helps in containerized/proxy environments
});

export const firebaseService = {
  async getOffers(): Promise<Offer[]> {
    if (!isConfigValid) {
      console.warn("Firebase config is invalid. Returning empty offers.");
      return [];
    }
    try {
      const q = query(collection(db, 'offers'), orderBy('pointsRequired', 'asc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Offer));
    } catch (error) {
      console.error("Error fetching offers:", error);
      return [];
    }
  }
};

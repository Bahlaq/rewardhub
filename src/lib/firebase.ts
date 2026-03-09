import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { Store, DiscountCode } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export const firebaseService = {
  // Stores
  async getStores(): Promise<Store[]> {
    const storesCol = collection(db, 'stores');
    const snapshot = await getDocs(query(storesCol, orderBy('name')));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Store));
  },

  async addStore(store: Omit<Store, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'stores'), {
      ...store,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  },

  async updateStore(id: string, store: Partial<Store>): Promise<void> {
    const docRef = doc(db, 'stores', id);
    await updateDoc(docRef, {
      ...store,
      updatedAt: new Date().toISOString(),
    });
  },

  async deleteStore(id: string): Promise<void> {
    await deleteDoc(doc(db, 'stores', id));
  },

  // Discount Codes
  async getDiscountCodes(isApiFetched?: boolean): Promise<DiscountCode[]> {
    const codesCol = collection(db, 'discountCodes');
    let q = query(codesCol, orderBy('createdAt', 'desc'));
    
    if (isApiFetched !== undefined) {
      q = query(codesCol, where('isApiFetched', '==', isApiFetched), orderBy('createdAt', 'desc'));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiscountCode));
  },

  async addDiscountCode(code: Omit<DiscountCode, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'discountCodes'), {
      ...code,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  },

  async deleteDiscountCode(id: string): Promise<void> {
    await deleteDoc(doc(db, 'discountCodes', id));
  }
};

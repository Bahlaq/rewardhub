export interface Offer {
  id: string;
  brand: string;
  logoUrl: string;
  description: string;
  url: string;
  code?: string;
  points: number;
  category: string | string[];
  type: 'discount' | 'giftcard' | 'coupon' | 'subscription';
  expiryDate: string;
  countries?: string | string[] | null;
  country?: string;
}

export interface Transaction {
  id: string;
  type: 'earn' | 'claim';
  title: string;
  amount: number;
  timestamp: string;
  code?: string;
  rewardType?: 'code' | 'link';
}

export interface UserProfile {
  uid: string;
  email: string | null;
  points: number;
  claimsToday: number;
  lastClaimDate: string | null;
  totalEarned: number;
  boostLevel?: number;
  adsWatchedToday?: number;
  currentLevelAdCounter?: number;
  lastBoostDate?: string | null;
}

export interface AdLog {
  id: string;
  type: 'banner' | 'app_open' | 'rewarded';
  event: 'load' | 'show' | 'click' | 'reward' | 'error';
  timestamp: string;
  message?: string;
}

export interface Store {
  id: string;
  name: string;
  logoUrl: string;
  category: string;
  affiliateLink: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountCode {
  id: string;
  storeId: string;
  storeName: string;
  code: string;
  description: string;
  affiliateLink: string;
  expiryDate: string;
  isApiFetched: boolean;
  createdAt: string;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  reward: string;
  rewardType: 'code' | 'link';
  type: 'discount' | 'giftcard' | 'coupon' | 'subscription';
  pointsRequired: number;
  dailyLimit: number;
  imageUrl: string;
  expiryDate: string;
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
}

export interface ClaimRecord {
  id: string;
  userId: string;
  offerId: string;
  offerTitle: string;
  rewardCode: string;
  timestamp: string;
}

export interface AdLog {
  id: string;
  type: 'banner' | 'app_open' | 'rewarded';
  event: 'load' | 'show' | 'click' | 'reward' | 'error';
  timestamp: string;
  message?: string;
}

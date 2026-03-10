import { Offer } from './types';

export const MOCK_OFFERS: Offer[] = [
  {
    id: '1',
    title: 'Amazon $10 Gift Card',
    description: 'Get a $10 Amazon gift card code instantly.',
    reward: 'AMZN-XXXX-1234',
    type: 'giftcard',
    pointsRequired: 1000,
    dailyLimit: 10,
    imageUrl: 'https://picsum.photos/seed/amazon/400/300',
    expiryDate: '2026-12-31',
  },
  {
    id: '2',
    title: 'Nike 20% Discount',
    description: 'Exclusive 20% discount on all Nike products.',
    reward: 'NIKE-20-OFF',
    type: 'discount',
    pointsRequired: 500,
    dailyLimit: 10,
    imageUrl: 'https://picsum.photos/seed/nike/400/300',
    expiryDate: '2026-06-30',
  },
  {
    id: '3',
    title: 'Starbucks Coffee Coupon',
    description: 'One free tall latte at any Starbucks location.',
    reward: 'SBUX-FREE-LATTE',
    type: 'coupon',
    pointsRequired: 300,
    dailyLimit: 10,
    imageUrl: 'https://picsum.photos/seed/starbucks/400/300',
    expiryDate: '2026-03-15',
  },
  {
    id: '4',
    title: 'Netflix 1 Month Sub',
    description: 'One month of Netflix Standard subscription.',
    reward: 'NFLX-FREE-MONTH',
    type: 'giftcard',
    pointsRequired: 1500,
    dailyLimit: 10,
    imageUrl: 'https://picsum.photos/seed/netflix/400/300',
    expiryDate: '2026-08-20',
  }
];

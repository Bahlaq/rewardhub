import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ═══════════════════════════════════════════════════════════════════════
// Helper: Send notification to ALL registered FCM tokens
// Automatically cleans up expired/invalid tokens
// ═══════════════════════════════════════════════════════════════════════
async function sendToAllTokens(
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  const snapshot = await db.collection("fcm_tokens").get();
  if (snapshot.empty) {
    logger.info("No FCM tokens registered — skipping");
    return 0;
  }

  const tokens = [...new Set(snapshot.docs.map((d) => d.data().token as string))];
  logger.info(`Sending to ${tokens.length} devices: "${title}"`);

  let successCount = 0;
  const invalidTokenIds: string[] = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: data || {},
      android: {
        priority: "high",
        notification: {
          channelId: "rewardhub_default",
          icon: "ic_notification",
          color: "#4F46E5",
        },
      },
    });

    successCount += response.successCount;
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === "messaging/invalid-registration-token" ||
          resp.error?.code === "messaging/registration-token-not-registered")
      ) {
        const badToken = batch[idx];
        const match = snapshot.docs.find((d) => d.data().token === badToken);
        if (match) invalidTokenIds.push(match.id);
      }
    });
  }

  if (invalidTokenIds.length > 0) {
    const b = db.batch();
    invalidTokenIds.forEach((id) => b.delete(db.collection("fcm_tokens").doc(id)));
    await b.commit();
    logger.info(`Cleaned ${invalidTokenIds.length} invalid tokens`);
  }

  logger.info(`Result: ${successCount} sent, ${invalidTokenIds.length} cleaned`);
  return successCount;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. DAILY REMINDER — 9:00 AM Amman time
//    Retention nudge. Rotates through different messages daily.
// ═══════════════════════════════════════════════════════════════════════
export const dailyReminder = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Amman", retryCount: 1 },
  async () => {
    logger.info("Daily reminder triggered — 9:00 AM");

    const messages = [
      { title: "🎁 Your daily rewards are waiting!", body: "Watch a quick ad and earn 100 points. Don't miss out!" },
      { title: "💰 Ready to earn?", body: "New offers and rewards are available. Open RewardHub now!" },
      { title: "⚡ Boost your points today!", body: "Complete your daily boost to earn free rewards!" },
      { title: "🏆 Don't break your streak!", body: "Open RewardHub and claim your daily points." },
      { title: "🔥 Deals are expiring soon!", body: "Check the latest offers before they're gone." },
    ];

    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );
    const msg = messages[dayOfYear % messages.length];

    await sendToAllTokens(msg.title, msg.body, { type: "daily_reminder" });
  }
);

// ═══════════════════════════════════════════════════════════════════════
// 2. DAILY OFFER DIGEST — 8:00 PM Amman time (11 hours after reminder)
//
//    Queries /offers for documents created in the last 24 hours.
//    If new offers exist → sends ONE summary notification.
//    If no new offers → does nothing (no spam).
//
//    Examples:
//      1 offer:  "Check out the new offer from Nike!"
//      3 offers: "Check out the 3 new offers from Nike, Hotels, Adidas!"
//      6 offers: "Check out the 6 new offers from Nike, Hotels, and 4 more!"
// ═══════════════════════════════════════════════════════════════════════
export const dailyOfferDigest = onSchedule(
  { schedule: "0 20 * * *", timeZone: "Asia/Amman", retryCount: 1 },
  async () => {
    logger.info("Daily offer digest triggered — 8:00 PM");

    // Calculate 24 hours ago
    const twentyFourHoursAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    // Query offers created in the last 24 hours
    // Requires a 'createdAt' timestamp field on offer documents.
    // Fallback: if no createdAt field exists, we check all offers
    // and look for ones with a timestamp-like field.
    const snapshot = await db
      .collection("offers")
      .where("createdAt", ">=", twentyFourHoursAgo)
      .get();

    if (snapshot.empty) {
      logger.info("No new offers in the last 24 hours — skipping digest");
      return;
    }

    const brands = snapshot.docs
      .map((d) => d.data().brand as string)
      .filter(Boolean);

    if (brands.length === 0) {
      logger.info("Offers found but no brand names — skipping");
      return;
    }

    let title: string;
    let body: string;

    if (brands.length === 1) {
      title = "🛍️ New Offer Today!";
      body = `Check out the new offer from ${brands[0]}! Open RewardHub to claim it.`;
    } else if (brands.length <= 3) {
      title = `🛍️ ${brands.length} New Offers Today!`;
      body = `Check out the new offers from ${brands.join(", ")}! Open RewardHub now.`;
    } else {
      title = `🛍️ ${brands.length} New Offers Today!`;
      body = `Check out the ${brands.length} new offers from ${brands.slice(0, 2).join(", ")}, and ${brands.length - 2} more!`;
    }

    await sendToAllTokens(title, body, { type: "daily_offer_digest" });
    logger.info(`Digest sent for ${brands.length} offers`);
  }
);

// ═══════════════════════════════════════════════════════════════════════
// 3. MANUAL CAMPAIGNS — No code needed!
//
//    Firebase Console → Messaging → New Campaign → Notification
//    Target: Topic "all_users" or "All app users"
//
//    The app handles foreground (toast) and background (native) display.
//
//    Example campaigns:
//      - Eid Mubarak: "🌙 Eid special! Double points this week!"
//      - Black Friday: "🖤 Black Friday deals are LIVE! Open now!"
//      - Ramadan:      "🕌 Ramadan Kareem! New exclusive offers inside."
// ═══════════════════════════════════════════════════════════════════════

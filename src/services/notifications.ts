// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — DISABLED
//
// The @capacitor/push-notifications plugin was causing force-close
// crashes on multiple Android devices when the user tapped "Allow"
// on the notification permission dialog.
//
// Root cause: The native FCM registration process conflicts with
// AdMob's native activity on certain Android versions/devices.
//
// This module is now a no-op. Push notifications will be re-enabled
// in a future update after the core app is stable.
//
// Manual campaigns can still be sent via Firebase Console → Messaging
// because FCM handles those natively without needing this JS code.
// ═══════════════════════════════════════════════════════════════════════

export async function initPushNotifications(
  _onToken: (token: string) => void
): Promise<void> {
  console.log('[Push] Disabled in this version — skipping');
  return;
}

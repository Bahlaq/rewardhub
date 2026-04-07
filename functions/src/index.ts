import { Capacitor } from '@capacitor/core';

// ═══════════════════════════════════════════════════════════════════════
// Push Notification Service — CRASH-SAFE version
//
// OLD BUG: Static import `import { PushNotifications } from '...'` at
//   the top of the file loaded the native module on app startup.
//   On older Android devices or devices where the native plugin isn't
//   properly registered, this caused an immediate crash (force close).
//
// FIX: Use dynamic import() inside the initialize function. If the
//   import fails (plugin not available), the app continues normally
//   without push notifications — no crash, no error visible to user.
// ═══════════════════════════════════════════════════════════════════════

type TokenCallback = (token: string) => void;
let initialized = false;

export const notificationService = {
  async initialize(onToken: TokenCallback): Promise<void> {
    if (!Capacitor.isNativePlatform() || initialized) return;

    try {
      // Dynamic import — if the plugin isn't available, this throws
      // and we catch it gracefully below
      const { PushNotifications } = await import('@capacitor/push-notifications');

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') {
        console.log('[Push] Permission denied — skipping');
        return;
      }

      await PushNotifications.addListener('registration', (token: any) => {
        console.log('[Push] Token received');
        onToken(token.value);
      });

      await PushNotifications.addListener('registrationError', (err: any) => {
        console.error('[Push] Registration error:', err);
      });

      await PushNotifications.addListener('pushNotificationReceived', async (notification: any) => {
        // Show foreground notification as toast
        try {
          const { Toast } = await import('@capacitor/toast');
          Toast.show({ text: notification.title || notification.body || 'New notification', duration: 'long' });
        } catch {}
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (_action: any) => {
        // User tapped notification — app is already opening
      });

      await PushNotifications.register();
      initialized = true;
      console.log('[Push] Initialized');

    } catch (err) {
      // Completely non-fatal — app works without push notifications
      console.log('[Push] Not available on this device (non-fatal):', err instanceof Error ? err.message : err);
    }
  },
};

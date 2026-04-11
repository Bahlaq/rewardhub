// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — CRASH-SAFE, Promise-based
//
// ROOT CAUSE OF CRASH: On some Android devices, calling
//   PushNotifications.register() immediately after permission grant
//   triggers native code that conflicts with other native activities
//   (like App Open Ads). The native stack overflow crashes the app.
//
// FIX: 
//   1. ALL imports are dynamic (never crash on load)
//   2. register() is wrapped in try/catch with a delay
//   3. Returns a Promise<boolean> so App.tsx can WAIT for permission
//      to complete before showing any ads
// ═══════════════════════════════════════════════════════════════════════

let initialized = false;
let permissionResolved = false;

export const notificationService = {
  /** Returns true when permission flow is complete (granted or denied) */
  async initialize(onToken: (token: string) => void): Promise<boolean> {
    if (initialized) return permissionResolved;

    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return true;

      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Check permission
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt') {
        perm = await PushNotifications.requestPermissions();
      }

      permissionResolved = true;

      if (perm.receive !== 'granted') {
        console.log('[Push] Permission denied');
        initialized = true;
        return true; // Permission flow complete, just denied
      }

      // Small delay after permission grant to let native stack settle
      await new Promise(r => setTimeout(r, 1500));

      // Register listeners
      try {
        await PushNotifications.addListener('registration', (token: any) => {
          console.log('[Push] Token received');
          onToken(token.value);
        });

        await PushNotifications.addListener('registrationError', (err: any) => {
          console.error('[Push] Registration error:', err);
        });

        await PushNotifications.addListener('pushNotificationReceived', async (notification: any) => {
          try {
            const { Toast } = await import('@capacitor/toast');
            Toast.show({ text: notification.title || 'New notification', duration: 'long' });
          } catch {}
        });

        await PushNotifications.addListener('pushNotificationActionPerformed', () => {});

        await PushNotifications.register();
        initialized = true;
        console.log('[Push] Registered');
      } catch (regErr) {
        console.log('[Push] Register failed (non-fatal):', regErr);
        initialized = true;
      }

      return true;
    } catch (err) {
      console.log('[Push] Not available:', err instanceof Error ? err.message : err);
      permissionResolved = true;
      initialized = true;
      return true;
    }
  },

  isReady(): boolean {
    return permissionResolved;
  }
};

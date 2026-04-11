// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — CRASH-SAFE
// Returns a Promise<boolean> that resolves when the permission flow
// is 100% complete (granted, denied, or failed). App.tsx AWAITS this
// before initializing ANY ads.
// ═══════════════════════════════════════════════════════════════════════

let completed = false;

export const notificationService = {
  async initialize(onToken: (token: string) => void): Promise<boolean> {
    if (completed) return true;

    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        completed = true;
        return true;
      }

      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Step 1: Check / request permission
      let perm = await PushNotifications.checkPermissions();
      console.log('[Push] Current permission:', perm.receive);

      if (perm.receive === 'prompt') {
        console.log('[Push] Requesting permission...');
        perm = await PushNotifications.requestPermissions();
        console.log('[Push] User chose:', perm.receive);
      }

      // Mark as complete BEFORE any registration attempt
      completed = true;

      if (perm.receive !== 'granted') {
        console.log('[Push] Not granted — done');
        return true;
      }

      // Step 2: Wait 2 seconds after permission grant for native stack to settle
      console.log('[Push] Permission granted, waiting 2s before register...');
      await new Promise(r => setTimeout(r, 2000));

      // Step 3: Register listeners and FCM
      try {
        await PushNotifications.addListener('registration', (token: any) => {
          console.log('[Push] FCM token received:', token.value?.slice(0, 20) + '...');
          try { onToken(token.value); } catch (e) { console.error('[Push] onToken callback error:', e); }
        });

        await PushNotifications.addListener('registrationError', (err: any) => {
          console.error('[Push] Registration error:', JSON.stringify(err));
        });

        await PushNotifications.addListener('pushNotificationReceived', async (n: any) => {
          try {
            const { Toast } = await import('@capacitor/toast');
            Toast.show({ text: n.title || n.body || 'Notification', duration: 'long' });
          } catch {}
        });

        await PushNotifications.addListener('pushNotificationActionPerformed', () => {});

        console.log('[Push] Calling register()...');
        await PushNotifications.register();
        console.log('[Push] Register complete');
      } catch (regErr) {
        console.error('[Push] Register failed (non-fatal):', regErr);
      }

      return true;
    } catch (err) {
      console.error('[Push] Init failed (non-fatal):', err);
      completed = true;
      return true;
    }
  },
};

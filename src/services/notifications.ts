// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — TOTAL ISOLATION
//
// This module is COMPLETELY INDEPENDENT from the rest of the app.
// It CANNOT crash the app because:
//   1. ALL imports are dynamic (import() inside try/catch)
//   2. EVERY operation is wrapped in its own try/catch
//   3. register() has a 2-second delay after permission grant
//   4. The entire flow runs on a 10-second delay after being called
//   5. NO other system depends on this module's success or failure
//
// If ANY step fails, it logs to console and returns silently.
// The app works perfectly without push notifications.
// ═══════════════════════════════════════════════════════════════════════

let hasRun = false;

export async function initPushNotifications(
  onToken: (token: string) => void
): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  // Wait 10 seconds to ensure app is fully loaded, ads are done, etc.
  await new Promise(r => setTimeout(r, 10000));

  try {
    // Step 1: Check platform
    const capacitorModule = await import('@capacitor/core');
    if (!capacitorModule.Capacitor.isNativePlatform()) {
      console.log('[Push] Web platform — skipping');
      return;
    }

    // Step 2: Import plugin
    let PushPlugin: any;
    try {
      const mod = await import('@capacitor/push-notifications');
      PushPlugin = mod.PushNotifications;
    } catch (importErr) {
      console.log('[Push] Plugin not available:', importErr);
      return;
    }

    // Step 3: Check permission
    let permStatus: any;
    try {
      permStatus = await PushPlugin.checkPermissions();
      console.log('[Push] Permission status:', permStatus.receive);
    } catch (permErr) {
      console.log('[Push] checkPermissions failed:', permErr);
      return;
    }

    // Step 4: Request permission if needed
    if (permStatus.receive === 'prompt') {
      try {
        permStatus = await PushPlugin.requestPermissions();
        console.log('[Push] User chose:', permStatus.receive);
      } catch (reqErr) {
        console.log('[Push] requestPermissions failed:', reqErr);
        return;
      }
    }

    if (permStatus.receive !== 'granted') {
      console.log('[Push] Not granted — done');
      return;
    }

    // Step 5: Wait 2 seconds after permission for native stack to settle
    await new Promise(r => setTimeout(r, 2000));

    // Step 6: Add listeners (each in its own try/catch)
    try {
      await PushPlugin.addListener('registration', (token: any) => {
        console.log('[Push] Token received:', token?.value?.slice(0, 20));
        try { onToken(token.value); } catch (e) { console.error('[Push] onToken error:', e); }
      });
    } catch (e) { console.log('[Push] addListener(registration) failed:', e); }

    try {
      await PushPlugin.addListener('registrationError', (err: any) => {
        console.error('[Push] FCM registration error:', JSON.stringify(err));
      });
    } catch (e) { console.log('[Push] addListener(registrationError) failed:', e); }

    try {
      await PushPlugin.addListener('pushNotificationReceived', async (n: any) => {
        try {
          const { Toast } = await import('@capacitor/toast');
          Toast.show({ text: n?.title || n?.body || 'Notification', duration: 'long' });
        } catch {}
      });
    } catch (e) { console.log('[Push] addListener(received) failed:', e); }

    try {
      await PushPlugin.addListener('pushNotificationActionPerformed', () => {});
    } catch (e) { /* silent */ }

    // Step 7: Register with FCM
    try {
      console.log('[Push] Calling register()...');
      await PushPlugin.register();
      console.log('[Push] register() success');
    } catch (regErr) {
      console.error('[Push] register() failed:', regErr);
      // Still non-fatal — app works without push
    }

  } catch (outerErr) {
    console.error('[Push] Unexpected error (non-fatal):', outerErr);
  }
}

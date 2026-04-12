// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — NUCLEAR SAFE
//
// WHY PREVIOUS VERSIONS CRASHED:
//   Even with dynamic import(), the Capacitor native bridge registers
//   ALL plugins at app startup. If PushNotifications' native module
//   has initialization issues on certain Android devices, calling ANY
//   method on it causes a native crash that kills the WebView.
//
// THE FIX:
//   1. Check Capacitor.isPluginAvailable('PushNotifications') FIRST
//      This returns false if the native module isn't properly registered
//   2. Every single operation in its own try/catch
//   3. 10-second internal delay before doing anything
//   4. 2-second delay after permission grant before register()
// ═══════════════════════════════════════════════════════════════════════

let hasRun = false;

export async function initPushNotifications(
  onToken: (token: string) => void
): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  // Internal delay — let the app fully load first
  await new Promise(r => setTimeout(r, 10000));

  // Step 1: Check if we're on a native platform
  let Capacitor: any;
  try {
    const mod = await import('@capacitor/core');
    Capacitor = mod.Capacitor;
  } catch (e) {
    console.log('[Push] Capacitor not available');
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] Not native — skip');
    return;
  }

  // Step 2: Check if the native plugin is actually registered
  // THIS IS THE KEY CHECK that prevents the crash
  try {
    const available = Capacitor.isPluginAvailable('PushNotifications');
    console.log('[Push] Plugin available:', available);
    if (!available) {
      console.log('[Push] Native plugin not registered — skip');
      return;
    }
  } catch (e) {
    console.log('[Push] isPluginAvailable check failed:', e);
    return;
  }

  // Step 3: Dynamic import of the plugin
  let PushPlugin: any;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushPlugin = mod.PushNotifications;
    console.log('[Push] Module imported');
  } catch (e) {
    console.log('[Push] Import failed:', e);
    return;
  }

  // Step 4: Check permissions
  let permResult: string = 'denied';
  try {
    const status = await PushPlugin.checkPermissions();
    permResult = status.receive;
    console.log('[Push] Check:', permResult);
  } catch (e) {
    console.log('[Push] checkPermissions error:', e);
    return;
  }

  // Step 5: Request if needed
  if (permResult === 'prompt') {
    try {
      const result = await PushPlugin.requestPermissions();
      permResult = result.receive;
      console.log('[Push] User chose:', permResult);
    } catch (e) {
      console.log('[Push] requestPermissions error:', e);
      return;
    }
  }

  if (permResult !== 'granted') {
    console.log('[Push] Not granted');
    return;
  }

  // Step 6: Wait for native stack to settle after permission dialog
  await new Promise(r => setTimeout(r, 2000));

  // Step 7: Add registration listener
  try {
    await PushPlugin.addListener('registration', (token: any) => {
      console.log('[Push] Token:', token?.value?.slice(0, 20) + '...');
      try {
        onToken(token.value);
      } catch (cbErr) {
        console.error('[Push] Token callback error:', cbErr);
      }
    });
  } catch (e) {
    console.log('[Push] registration listener failed:', e);
  }

  // Step 8: Add error listener
  try {
    await PushPlugin.addListener('registrationError', (err: any) => {
      console.error('[Push] FCM error:', JSON.stringify(err));
    });
  } catch (e) { /* silent */ }

  // Step 9: Add foreground listener
  try {
    await PushPlugin.addListener('pushNotificationReceived', async (n: any) => {
      try {
        const { Toast } = await import('@capacitor/toast');
        Toast.show({ text: n?.title || 'Notification', duration: 'long' });
      } catch {}
    });
  } catch (e) { /* silent */ }

  // Step 10: Add action listener
  try {
    await PushPlugin.addListener('pushNotificationActionPerformed', () => {});
  } catch (e) { /* silent */ }

  // Step 11: Register with FCM
  try {
    console.log('[Push] Registering...');
    await PushPlugin.register();
    console.log('[Push] Registered OK');
  } catch (e) {
    console.error('[Push] register() failed:', e);
  }
}

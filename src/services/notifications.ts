// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — Crash-safe init (v13.1.1)
//
// Fixes applied vs previous version:
//  • Removed ALL window.alert() calls. alert() from inside a Capacitor
//    plugin callback blocks the WebView JS thread and, combined with AdMob
//    initializing in parallel, triggers ANR/native crash on Android 13+.
//  • Creates the "rewardhub_default" notification channel BEFORE register()
//    so the FirebaseMessagingService doesn't crash on OEMs (Samsung/Xiaomi)
//    that require the channel referenced by the manifest meta-data to exist.
//  • Wraps PushNotifications.register() in its own try/catch so a native
//    FCM failure (bad google-services.json, missing Play Services) is
//    downgraded to a logged warning instead of an unhandled rejection.
//  • onToken callback failures no longer retry indefinitely — Promise
//    rejections are captured properly.
// ═══════════════════════════════════════════════════════════════════════

let hasRun = false;

export async function initPushNotifications(
  onToken: (token: string) => void
): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  try {
    // Step 1: Platform check
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      console.log('[Push] Web — skip');
      return;
    }

    // Step 2: Plugin availability
    if (!Capacitor.isPluginAvailable('PushNotifications')) {
      console.log('[Push] Plugin not registered — skip');
      return;
    }

    // Step 3: Import plugin
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Step 4: Permissions
    let perm = await PushNotifications.checkPermissions();
    console.log('[Push] Current permission:', perm.receive);

    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
      console.log('[Push] User chose:', perm.receive);
    }

    if (perm.receive !== 'granted') {
      console.log('[Push] Permission denied — exiting init');
      return;
    }

    // Step 5: Create the notification channel BEFORE register()
    // Must match the id referenced by
    // com.google.firebase.messaging.default_notification_channel_id in the manifest.
    try {
      await PushNotifications.createChannel({
        id: 'rewardhub_default',
        name: 'RewardHub Notifications',
        description: 'Daily reminders and new offer alerts',
        importance: 4,      // IMPORTANCE_HIGH
        visibility: 1,      // VISIBILITY_PUBLIC
        lights: true,
        vibration: true,
      });
      console.log('[Push] Channel created');
    } catch (chanErr) {
      console.warn('[Push] createChannel non-fatal:', chanErr);
    }

    // Step 6: Attach listeners BEFORE register()
    await PushNotifications.addListener('registration', function(token: any) {
      const tokenValue = token && token.value ? String(token.value) : '';
      if (!tokenValue) {
        console.error('[Push] Empty token received');
        return;
      }
      console.log('[Push] Token received (len=' + tokenValue.length + ')');
      // Fire-and-forget; callback itself must NOT throw synchronously.
      try {
        Promise.resolve(onToken(tokenValue)).catch(function(err) {
          console.error('[Push] onToken promise rejected:', err);
        });
      } catch (err) {
        console.error('[Push] onToken threw synchronously:', err);
      }
    });

    await PushNotifications.addListener('registrationError', function(err: any) {
      console.error('[Push] registrationError:', err && err.error ? err.error : err);
    });

    await PushNotifications.addListener('pushNotificationReceived', async function(n: any) {
      try {
        const { Toast } = await import('@capacitor/toast');
        await Toast.show({
          text: (n && n.title) ? String(n.title) : 'Notification',
          duration: 'long',
        });
      } catch {
        // silent
      }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', function() {
      // User tapped notification — handle deep-link here if needed
    });

    // Step 7: Register — isolated try/catch so a native FCM failure
    // (bad google-services.json / missing Play Services / package mismatch)
    // is logged instead of crashing the app.
    try {
      console.log('[Push] Calling register()…');
      await PushNotifications.register();
      console.log('[Push] register() OK');
    } catch (regErr) {
      console.error('[Push] register() failed (non-fatal):', regErr);
    }

  } catch (err) {
    console.error('[Push] Fatal init error (caught):', err);
  }
}

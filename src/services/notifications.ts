// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — v13.2.0 crash-proof init.
//
// Why every single plugin call is in its own try/catch:
//   A single unhandled rejection from a plugin bridge can be surfaced to
//   native code and contribute to an ANR on slow devices. Per-call wrapping
//   means a failure in (e.g.) `createChannel` doesn't abort `register`,
//   and a failure in `register` doesn't abort the listener setup.
//
// This function is invoked by App.tsx *8 seconds* after the user is
// authenticated — well after the App Open Ad has shown and closed, so
// the permission dialog is no longer racing AdMob on the main thread.
// ═══════════════════════════════════════════════════════════════════════

let hasRun = false;

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error('[Push] ' + label + ' failed:', err);
    return null;
  }
}

export async function initPushNotifications(
  onToken: (token: string) => void
): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      console.log('[Push] Web — skip');
      return;
    }
    if (!Capacitor.isPluginAvailable('PushNotifications')) {
      console.log('[Push] Plugin not registered — skip');
      return;
    }

    const { PushNotifications } = await import('@capacitor/push-notifications');

    // ─── Permission check (individually wrapped) ────────────────────
    let perm = await safe('checkPermissions', function() {
      return PushNotifications.checkPermissions();
    });
    if (!perm) return;

    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      const reqResult = await safe('requestPermissions', function() {
        return PushNotifications.requestPermissions();
      });
      if (!reqResult) return;
      perm = reqResult;
    }

    if (perm.receive !== 'granted') {
      console.log('[Push] Permission not granted — stopping init');
      return;
    }

    // ─── Channel (must exist before register() on Android 13+ OEMs) ──
    await safe('createChannel', function() {
      return PushNotifications.createChannel({
        id: 'rewardhub_default',
        name: 'RewardHub Notifications',
        description: 'Daily reminders and new offer alerts',
        importance: 4,    // IMPORTANCE_HIGH
        visibility: 1,    // VISIBILITY_PUBLIC
        lights: true,
        vibration: true,
      });
    });

    // ─── Listeners (each one isolated) ──────────────────────────────
    await safe('addListener:registration', function() {
      return PushNotifications.addListener('registration', function(token: any) {
        try {
          const tokenValue = token && token.value ? String(token.value) : '';
          if (!tokenValue) {
            console.error('[Push] Empty token');
            return;
          }
          // Fire-and-forget — rejections can't escape.
          Promise.resolve().then(function() { return onToken(tokenValue); })
            .catch(function(e) { console.error('[Push] onToken rejected:', e); });
        } catch (e) {
          console.error('[Push] registration handler threw:', e);
        }
      });
    });

    await safe('addListener:registrationError', function() {
      return PushNotifications.addListener('registrationError', function(err: any) {
        console.error('[Push] registrationError:', err && err.error ? err.error : err);
      });
    });

    await safe('addListener:received', function() {
      return PushNotifications.addListener('pushNotificationReceived', async function(n: any) {
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
    });

    await safe('addListener:actionPerformed', function() {
      return PushNotifications.addListener('pushNotificationActionPerformed', function() {
        // User tapped notification
      });
    });

    // ─── Let the JS/native bridge settle before calling register() ─
    await new Promise(function(r) { setTimeout(r, 500); });

    await safe('register', function() {
      return PushNotifications.register();
    });

    console.log('[Push] init complete');

  } catch (err) {
    console.error('[Push] Fatal init error (caught at top level):', err);
  }
}

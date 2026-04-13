// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — Robust with Retry + Debug Alert
//
// Sequence: isPluginAvailable → checkPermissions → requestPermissions
//           → wait 3s → register → retry token save up to 5 times
//
// Debug: Shows window.alert with token for manual verification
// ═══════════════════════════════════════════════════════════════════════

let hasRun = false;

export async function initPushNotifications(
  onToken: (token: string) => void
): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  try {
    // Step 1: Check platform
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      console.log('[Push] Web — skip');
      return;
    }

    // Step 2: Check if native plugin is registered (prevents crash)
    const available = Capacitor.isPluginAvailable('PushNotifications');
    console.log('[Push] Plugin available:', available);
    if (!available) {
      console.log('[Push] Plugin not registered — skip');
      return;
    }

    // Step 3: Import plugin
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Step 4: Check permissions
    let perm = await PushNotifications.checkPermissions();
    console.log('[Push] Permission:', perm.receive);

    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
      console.log('[Push] User chose:', perm.receive);
    }

    if (perm.receive !== 'granted') {
      console.log('[Push] Denied');
      return;
    }

    // Step 5: Wait 3s for native stack to settle
    await new Promise(function(r) { setTimeout(r, 3000); });

    // Step 6: Register listeners
    await PushNotifications.addListener('registration', function(token: any) {
      var tokenValue = token && token.value ? token.value : null;
      console.log('[Push] Token:', tokenValue ? tokenValue.slice(0, 30) : 'NULL');

      // DEBUG: Show token on screen
      try {
        window.alert('[DEBUG] FCM Token: ' + (tokenValue ? tokenValue.slice(0, 50) + '...' : 'NULL'));
      } catch (e) {
        // alert not available
      }

      if (!tokenValue) {
        console.error('[Push] Token is null/undefined!');
        return;
      }

      // Retry logic: try up to 5 times with 5s delay
      var attempt = 0;
      var maxRetries = 5;

      function tryCallback() {
        attempt++;
        console.log('[Push] Token callback attempt ' + attempt + '/' + maxRetries);
        try {
          onToken(tokenValue);
          console.log('[Push] Token callback succeeded on attempt ' + attempt);
        } catch (err) {
          console.error('[Push] Token callback failed attempt ' + attempt + ':', err);
          if (attempt < maxRetries) {
            setTimeout(tryCallback, 5000);
          } else {
            console.error('[Push] Token callback failed after ' + maxRetries + ' attempts');
          }
        }
      }

      tryCallback();
    });

    await PushNotifications.addListener('registrationError', function(err: any) {
      console.error('[Push] Registration error:', JSON.stringify(err));
      try {
        window.alert('[DEBUG] Push registration error: ' + JSON.stringify(err));
      } catch (e) {
        // alert not available
      }
    });

    await PushNotifications.addListener('pushNotificationReceived', async function(n: any) {
      try {
        var { Toast } = await import('@capacitor/toast');
        Toast.show({ text: n && n.title ? n.title : 'Notification', duration: 'long' });
      } catch (e) {
        // silent
      }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', function() {
      // User tapped notification
    });

    // Step 7: Register
    console.log('[Push] Calling register...');
    await PushNotifications.register();
    console.log('[Push] register() OK');

  } catch (err) {
    console.error('[Push] Fatal error:', err);
    try {
      window.alert('[DEBUG] Push fatal error: ' + String(err));
    } catch (e) {
      // alert not available
    }
  }
}

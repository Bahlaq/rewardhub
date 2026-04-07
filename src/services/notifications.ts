import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Toast } from '@capacitor/toast';

// ═══════════════════════════════════════════════════════════════════════
// Push Notification Service
//
// Architecture:
//   1. App requests notification permission after user signs in
//   2. FCM assigns a device token → stored in Firestore /fcm_tokens
//   3. Cloud Functions use these tokens to send:
//      - Daily reminders (scheduled at 9 AM via Cloud Scheduler)
//      - New offer alerts (Firestore onCreate trigger on /offers)
//   4. Manual campaigns sent via Firebase Console → FCM topics
//
// Safety:
//   - Web is a no-op (PushNotifications is native-only)
//   - Permission denied → silent continue
//   - Token storage failure → silent continue
//   - Does NOT interfere with Google Sign-In or AdMob
// ═══════════════════════════════════════════════════════════════════════

type TokenCallback = (token: string) => void;
let initialized = false;

export const notificationService = {
  /**
   * Initialize push notifications after user authentication.
   * @param onToken — Called with the FCM token for Firestore storage
   */
  async initialize(onToken: TokenCallback): Promise<void> {
    if (!Capacitor.isNativePlatform() || initialized) return;

    try {
      // 1. Check / request permission
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') {
        console.log('[Push] Permission denied — skipping');
        return;
      }

      // 2. Register listeners BEFORE calling register()

      // FCM token received
      await PushNotifications.addListener('registration', (token) => {
        console.log('[Push] Token:', token.value.slice(0, 30) + '...');
        onToken(token.value);
      });

      // Registration failed
      await PushNotifications.addListener('registrationError', (err) => {
        console.error('[Push] Registration error:', err);
      });

      // Notification received while app is in FOREGROUND
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] Foreground:', notification.title);
        Toast.show({
          text: notification.title || notification.body || 'New notification',
          duration: 'long',
        });
      });

      // User TAPPED a notification (from background or killed state)
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] Tapped:', action.notification.title);
        // App is opening — no routing needed for now.
        // Future: use action.notification.data to navigate to specific screens.
      });

      // 3. Register with FCM
      await PushNotifications.register();
      initialized = true;
      console.log('[Push] Initialized');

    } catch (err) {
      console.error('[Push] Init error (non-fatal):', err);
    }
  },
};

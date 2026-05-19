diff --git a/src/services/notifications.ts b/src/services/notifications.ts
index f45e2e914294198535a52635c11f89a62e1fb33d..e6d78effa2bf20ac0f1a3164c2f8c6fb0c4c879f 100644
--- a/src/services/notifications.ts
+++ b/src/services/notifications.ts
@@ -1,68 +1,71 @@
 import { Capacitor } from '@capacitor/core';
 
 type TokenCallback = (token: string) => void;
 
 let registerCalled = false;
+let listenersAttached = false;
 
 function loadPushPlugin(): Promise<{ plugin: any } | null> {
   console.log('[Push][1] loadPushPlugin — attempting dynamic import...');
   return import('@capacitor/push-notifications')
     .then(function (mod) {
       const plugin = mod.PushNotifications || null;
       console.log('[Push][1] loadPushPlugin — success, plugin:', plugin ? 'loaded' : 'null');
       return plugin ? { plugin } : null;
     })
     .catch(function (e) {
       console.error('[Push][1] loadPushPlugin — FAILED:', e);
       return null;
     });
 }
 
 async function ensureDefaultChannel(PushNotifications: any): Promise<void> {
   if (Capacitor.getPlatform() !== 'android') return;
   try {
     await PushNotifications.createChannel({
       id: 'default',
       name: 'General Notifications',
       description: 'Reward updates and account activity',
       importance: 3,
       visibility: 1,
       sound: 'default',
       lights: true,
       vibration: true,
     });
     console.log('[Push][3] createChannel OK');
   } catch (e) {
     console.warn('[Push][3] createChannel failed (non-fatal):', e);
   }
 }
 
 function attachListenersOnce(
   PushNotifications: any,
   onToken: TokenCallback,
 ): void {
+  if (listenersAttached) return;
+  listenersAttached = true;
   console.log('[Push][4] attaching listeners...');
   PushNotifications.addListener('registration', function (token: any) {
     console.log('[Push][5] ★ registration event fired!');
     try {
       const raw = token && typeof token === 'object' ? token.value : token;
       console.log('[Push][5] token len=' + (raw ? raw.length : 0));
       if (typeof raw === 'string' && raw.length > 0) {
         onToken(raw);
       }
     } catch (cbErr) {
       console.error('[Push][5] onToken callback threw:', cbErr);
     }
   });
 
   PushNotifications.addListener('registrationError', function (err: any) {
     console.error('[Push][5] ★ registrationError:', JSON.stringify(err));
   });
 
   PushNotifications.addListener('pushNotificationReceived', function (n: any) {
     console.log('[Push] received foregrounded:', n && n.title);
   });
 
   PushNotifications.addListener('pushNotificationActionPerformed', function (a: any) {
     console.log('[Push] action performed:', a && a.actionId);
   });
@@ -73,138 +76,143 @@ function attachListenersOnce(
 // Main entry — called when user taps "Enable Notifications" in our prompt.
 //
 // CRITICAL ANDROID FIX:
 // On aggressive OEMs (Samsung/Xiaomi), requestPermissions() shows the
 // system dialog which causes onPause/onResume — and the OS kills the
 // WebView process during the pause. The user then sees their home
 // screen and our app is gone.
 //
 // SOLUTION: On Android, call register() FIRST (no UI, safe). The FCM
 // token is obtained and saved to Firestore BEFORE the permission dialog
 // appears. Then we request permissions. If the app gets killed during
 // the dialog, the token is already saved — no harm done. POST_NOTIFICATIONS
 // permission only controls notification DISPLAY, not token registration,
 // so the token works regardless.
 //
 // On iOS, requestPermissions() does not cause the same crash. We can
 // keep the standard order: request permission, then register.
 // ═══════════════════════════════════════════════════════════════════════
 export async function initPushNotifications(
   onToken: TokenCallback
 ): Promise<void> {
   console.log('[Push] initPushNotifications — platform:', Capacitor.getPlatform());
 
   if (!Capacitor.isNativePlatform()) return;
   if (registerCalled) return;
-  registerCalled = true;
 
   const wrapper = await loadPushPlugin();
   if (!wrapper) {
     console.log('[Push] BAIL — plugin not in bundle');
     return;
   }
   const PushNotifications = wrapper.plugin;
 
   if (Capacitor.getPlatform() === 'android') {
     // ─── ANDROID PATH ──────────────────────────────────────────
     // Step 1: channel + listeners + register (NO permission dialog yet).
     // The FCM token comes back via the registration event listener.
     await ensureDefaultChannel(PushNotifications);
     attachListenersOnce(PushNotifications, onToken);
     try {
       await PushNotifications.register();
+      registerCalled = true;
       console.log('[Push] register() OK — token will arrive via event');
     } catch (e) {
       console.error('[Push] register() FAILED:', e);
+      return;
     }
 
-    // Step 2: NOW request permission. If this crashes the app, the
-    // token from step 1 is already saved in Firestore.
-    // Wait 2s so the registration event has time to fire and save the token.
-    await new Promise(r => setTimeout(r, 2000));
+    // IMPORTANT SAFETY CHANGE:
+    // We no longer call requestPermissions() on Android from inside the app.
+    // Some OEM ROMs still terminate the activity when the runtime permission
+    // dialog is accepted, which feels like a crash to the user.
+    //
+    // FCM token registration does not require POST_NOTIFICATIONS, so we keep
+    // token registration stable and avoid the crash path entirely.
+    // Notification display permission can still be enabled manually by users
+    // from Android system settings.
 
     try {
       const current = await PushNotifications.checkPermissions();
-      if (current.receive === 'granted' || current.receive === 'denied') {
-        console.log('[Push][android] permission already', current.receive);
-        return;
+      if (current.receive !== 'granted') {
+        console.log('[Push][android] permission is', current.receive, '— skipping in-app request to prevent OEM crash');
+      } else {
+        console.log('[Push][android] permission already granted');
       }
-      console.log('[Push][android] requesting permission AFTER register');
-      const next = await PushNotifications.requestPermissions();
-      console.log('[Push][android] requestPermissions:', JSON.stringify(next));
     } catch (e) {
-      console.error('[Push][android] requestPermissions FAILED:', e);
+      console.error('[Push][android] checkPermissions FAILED:', e);
     }
     return;
   }
 
   // ─── iOS PATH ──────────────────────────────────────────────
   // iOS doesn't have the OEM-kill problem. Standard order is fine.
   try {
     const current = await PushNotifications.checkPermissions();
     let granted = current.receive === 'granted';
     if (!granted && current.receive !== 'denied') {
       const next = await PushNotifications.requestPermissions();
       granted = next.receive === 'granted';
     }
     if (!granted) {
       console.log('[Push][ios] permission not granted');
       return;
     }
     attachListenersOnce(PushNotifications, onToken);
     await PushNotifications.register();
+    registerCalled = true;
     console.log('[Push][ios] register() OK');
   } catch (e) {
     console.error('[Push][ios] FAILED:', e);
   }
 }
 
 // ═══════════════════════════════════════════════════════════════════════
 // Silent startup registration — fires on every app start.
 // Handles two cases:
 //   1. iOS: user previously granted permission; register silently.
 //   2. Android: previous session got killed during permission dialog.
 //      We register silently (no permission dialog) — token is saved.
 // ═══════════════════════════════════════════════════════════════════════
 export async function checkAndRegisterIfPermissionAlreadyGranted(
   onToken: TokenCallback
 ): Promise<void> {
   if (!Capacitor.isNativePlatform()) return;
   if (registerCalled) return;
 
   const wrapper = await loadPushPlugin();
   if (!wrapper) return;
   const PushNotifications = wrapper.plugin;
 
   try {
     if (Capacitor.getPlatform() === 'android') {
       // Android: ALWAYS register silently on startup (no permission dialog).
       // FCM tokens work without POST_NOTIFICATIONS permission.
-      registerCalled = true;
       await ensureDefaultChannel(PushNotifications);
       attachListenersOnce(PushNotifications, onToken);
       await PushNotifications.register();
+      registerCalled = true;
       console.log('[Push][silent-android] register() OK on startup');
       return;
     }
 
     // iOS: only register silently if permission already granted.
     const status = await PushNotifications.checkPermissions();
     if (status?.receive !== 'granted') return;
-    registerCalled = true;
     attachListenersOnce(PushNotifications, onToken);
     await PushNotifications.register();
+    registerCalled = true;
     console.log('[Push][silent-ios] register() OK');
   } catch (e) {
     console.warn('[Push][silent] failed (non-fatal):', e);
   }
 }
 
 export async function removeAllPushListeners(): Promise<void> {
   try {
     const wrapper = await loadPushPlugin();
     if (!wrapper) return;
     await wrapper.plugin.removeAllListeners();
   } catch (e) {
     console.warn('[Push] removeAllListeners failed:', e);
   }
 }

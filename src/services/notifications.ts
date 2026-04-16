// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — v13.4.0 NO-OP STUB  (refreshed 2026-04-16).
//
// The @capacitor/push-notifications plugin has been removed from
// package.json so its native Android code is no longer compiled into
// the APK. This module is kept only to preserve the import signature
// used elsewhere in the codebase without triggering TypeScript errors.
//
// Every call is a silent no-op. Calling initPushNotifications() does
// nothing, so the crash path (native FCM register triggering a Java
// exception that bypasses JS try/catch) cannot execute.
//
// To restore push notifications later:
//   1. Add "@capacitor/push-notifications": "^6.0.0" back to package.json
//   2. Restore the full implementation from git history (v13.3.0)
//   3. Re-enable the Phase 3 useEffect in App.tsx
//   4. Re-add POST_NOTIFICATIONS / c2dm.RECEIVE permissions to write_manifest.py
//   5. Re-add the FCM default_notification_channel_id meta-data
// ═══════════════════════════════════════════════════════════════════════

export async function initPushNotifications(
  _onToken: (token: string) => void
): Promise<void> {
  // Intentional no-op. Plugin removed in v13.4.0 for stability.
  console.log('[Push] disabled — plugin removed from build');
}

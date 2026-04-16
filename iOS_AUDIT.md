# RewardHub — iOS Project Audit (v13.5.0)

Mapping every Android stability fix to its iOS equivalent so nothing silently regresses when we add the iOS target.

## 1. Android `configChanges` → iOS scene / state-restoration behavior

**Android problem:** the OS destroys & recreates `MainActivity` on density / font-scale / layout-direction / locale changes unless we declare them in `configChanges`. Previously this is what the permission dialog was doing on some OEMs.

**iOS:** UIKit never destroys the hosting `UIViewController` for the same reasons — it fires `traitCollectionDidChange`, `viewWillTransition(to:with:)`, etc., on the existing instance. Capacitor handles these transparently. **No iOS equivalent needed.**

Caveats to keep an eye on:

- `UIApplicationExitsOnSuspend` — must NOT be set to `YES` in Info.plist (Capacitor's default project template leaves it absent, which is correct).
- Multi-scene / multi-window support (`UIApplicationSupportsMultipleScenes`) — leave at default `NO` unless iPad multi-window is an explicit product goal; turning it on changes the lifecycle model.

## 2. Android `launchMode="singleTask"` / `alwaysRetainTaskState="true"`

**Android problem:** a backgrounded app re-launched from a notification could spawn a second `MainActivity` and confuse state.

**iOS:** tasks don't exist; the app is a single process with a single root controller. A tap on a push notification resumes the app via `userNotificationCenter:didReceive:` rather than creating a new instance. **No iOS equivalent needed.**

## 3. Android POST_NOTIFICATIONS permission

**Android:** required from API 33+, declared in `AndroidManifest.xml`, requested at runtime by `PushNotifications.requestPermissions()`.

**iOS:** no manifest entry. Runtime request is the same call — `PushNotifications.requestPermissions()` — which shows the iOS-style alert. The Info.plist needs no permission entry for push itself; you only add `NSUserTrackingUsageDescription` for ATT (see #6).

What to do:

- Info.plist **must** include:
  - `UIBackgroundModes` with `remote-notification` (so silent pushes wake the app)
- Add an **Apple Push Notifications** capability in the Xcode target (this is in `ios/App/App.entitlements`; key `aps-environment` with value `development` or `production`).
- Ensure the APNs Auth Key is uploaded to the Firebase console under Project Settings → Cloud Messaging → iOS app configuration. Without this, APNs tokens are returned but FCM never converts them.

## 4. FCM default channel

**Android:** `com.google.firebase.messaging.default_notification_channel_id` meta-data + `createChannel('default', …)` at runtime. Already handled in `write_manifest.py` + `notifications.ts`.

**iOS:** channels don't exist. iOS has notification *categories* for action buttons, but for a single-tier notification product we don't need them. The `ensureDefaultChannel()` helper in `notifications.ts` returns early on iOS. **No iOS work needed.**

## 5. AdMob SDK init

**Android:** `com.google.android.gms.ads.APPLICATION_ID` meta-data in manifest.

**iOS:** the equivalent is a **`GADApplicationIdentifier`** string in Info.plist:

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-1560161047680443~YOUR_IOS_APP_ID</string>
```

Important: the iOS AdMob app ID is **different** from the Android one. You must create a separate AdMob app in the console (Apps → Add App → iOS) and paste its `~` ID into Info.plist.

Also add `SKAdNetworkIdentifier` entries to Info.plist — Apple requires 50+ of these for AdMob conversion tracking; Google publishes the current list at [`https://developers.google.com/admob/ios/ios14`](https://developers.google.com/admob/ios/ios14).

## 6. App Tracking Transparency (iOS only) — NEW in v13.5.0

iOS 14.5+ blocks IDFA access unless the user grants ATT permission. Without it, AdMob serves only non-personalized ads (lower eCPM).

**Implemented in v13.5.0:**

- `capacitor-plugin-app-tracking-transparency` added to `package.json`.
- `requestATTIfNeeded()` in `App.tsx` called in Phase 1 before AdMob init (IDFA availability is latched at SDK init).

**Info.plist requirement (you must add manually in Xcode):**

```xml
<key>NSUserTrackingUsageDescription</key>
<string>We use this to show you relevant ads and support the free rewards you earn.</string>
```

Keep the wording honest and short — Apple reviewers reject boilerplate "We use tracking for ads" text.

## 7. Google Sign-In (`@codetrix-studio/capacitor-google-auth`)

**Android:** uses the `google-services.json` SHA-1. No extra manifest entry.

**iOS:** needs two things in Info.plist:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.googleusercontent.apps.YOUR_IOS_CLIENT_ID</string>
        </array>
    </dict>
</array>

<key>GIDClientID</key>
<string>YOUR_IOS_CLIENT_ID.apps.googleusercontent.com</string>
```

The `REVERSED_CLIENT_ID` is in your `GoogleService-Info.plist` (drop that into `ios/App/App/`).

## 8. In-App Browser (`@capacitor/browser`)

No iOS-specific configuration. Uses `SFSafariViewController` under the hood.

## 9. Clipboard / Toast / Core

No iOS-specific configuration needed beyond the default Capacitor bridge.

## 10. Splash screen

v13.5.0 removed the JS-side splash loader. The remaining native splash is controlled by `capacitor.config.ts`:

```ts
plugins: {
  SplashScreen: {
    launchShowDuration: 0,   // native splash hidden immediately
    launchAutoHide: true,
    backgroundColor: '#ffffff',
    androidSplashResourceName: 'splash',
    androidScaleType: 'CENTER_CROP',
    showSpinner: false,
  },
}
```

For iOS you'll also want a **LaunchScreen.storyboard** with the app icon centered on a white background — Xcode scaffolds this when `cap add ios` runs, but double-check it shows the RewardHub logo rather than the default Capacitor `C`.

## Checklist to enable iOS builds

1. `npm install` — pulls `@capacitor/ios`, `@capacitor/push-notifications`, `capacitor-plugin-app-tracking-transparency`.
2. `npx cap add ios` — scaffolds `ios/App/`.
3. Drop `GoogleService-Info.plist` into `ios/App/App/` (not the `Pods/` folder) and add it to the App target in Xcode.
4. In Xcode, add capabilities:
   - Push Notifications
   - Background Modes → Remote notifications
5. Edit `ios/App/App/Info.plist` to add:
   - `GADApplicationIdentifier` (iOS AdMob app id)
   - `NSUserTrackingUsageDescription` (ATT prompt text)
   - `SKAdNetworkIdentifier` array (Google's list, ~50 entries)
   - `GIDClientID` + `CFBundleURLTypes` (Google Sign-In)
6. Upload APNs Auth Key to Firebase console → Cloud Messaging → iOS.
7. `npx cap sync ios && npx cap open ios` — build and run on a real device (push doesn't work on simulator).

## What we did NOT change for iOS

- `write_manifest.py` is Android-only and always will be.
- `AndroidManifest.xml` — unchanged for iOS (obviously).
- Android `configChanges`, `launchMode`, `alwaysRetainTaskState` — all Android-only, no equivalent needed on iOS.

All shared JS behavior (filters, ads hook, push wrapper, FCM save) automatically works on both platforms because everything is platform-guarded with `Capacitor.getPlatform()` or `Capacitor.isNativePlatform()`.

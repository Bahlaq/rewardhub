<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f0f8a058-39bc-406f-9a1a-97a49d1b8c92

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Push notifications

Installed Android and iOS apps subscribe themselves to the FCM topics `new_codes` and `all_users` the first time they open a build that includes this code. No Cloud Function is required. Signed-in users (Google or Firebase anonymous) also save their FCM token at `fcm_tokens/{uid}`. Devices that only have a `local_guest_*` id join the topics but do not write a token — Firestore rules reject that write.

The web app does not receive these broadcasts. Topic subscription is done by the native FCM SDK.

Ship a new store build before expecting any device to receive a message. The copy already installed does not contain this client.

### Send a test to `new_codes`

Firebase console: Engage → Messaging → New campaign → Notifications. Target the topic `new_codes`. Set a title and body, and add a custom data key `offerId` whose value is the Firestore document id in `offers`. If `offerId` is omitted, tapping the notification opens the rewards list.

Or send the same message with the FCM HTTP v1 API. `data` values must be strings. Replace `OFFER_DOC_ID` and send the bearer token of a service account that has the Firebase Cloud Messaging API enabled (`roles/firebasecloudmessaging.admin` or the Firebase Admin SDK role).

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json; charset=utf-8" \
  "https://fcm.googleapis.com/v1/projects/rewardhub-1ea27/messages:send" \
  -d @- <<'EOF'
{
  "message": {
    "topic": "new_codes",
    "notification": {
      "title": "New code: Noon 10% off",
      "body": "Open RewardHub to use this code."
    },
    "data": {
      "offerId": "OFFER_DOC_ID"
    },
    "android": {
      "priority": "HIGH",
      "notification": {
        "channel_id": "new_codes",
        "sound": "default"
      }
    },
    "apns": {
      "payload": {
        "aps": {
          "sound": "default"
        }
      }
    }
  }
}
EOF
```

`all_users` takes the same body with `"topic": "all_users"`.

### What you still have to do by hand

- Rebuild and publish Android and iOS. Codemagic's Android workflow regenerates the native project (`cap add` / `cap sync`) and then `write_manifest.py` writes `POST_NOTIFICATIONS` plus the `new_codes` default channel.
- iOS: the target now has the Push Notifications entitlement (`aps-environment` is `development` for Debug and `production` for Release). In the Apple Developer portal, enable Push Notifications on the App ID `com.rewardhub.official.app` and refresh the provisioning profile. In Xcode, confirm Signing & Capabilities shows Push Notifications. `GoogleService-Info.plist` is now copied into the app bundle; run `pod install` in `ios/App` before the next archive (Firebase Messaging 10.29.0 is pinned so it stays compatible with the AdMob SDK).
- Firebase console → Project settings → Cloud Messaging → Apple app: upload the APNs Authentication Key (`.p8`), Key ID, and Team ID. Without that key, iOS returns an APNs token but FCM cannot deliver.
- Android needs no extra console step. FCM is already enabled and `google-services.json` is the Android app `com.rewardhub.official.app`. On Android 13+ the app asks for notification permission a few seconds after launch. If a user denies it, they must turn notifications on in system settings; the app will not ask again for 24 hours.
- A device joins the topics only after it has opened the updated app once and (on iOS) allowed notifications.

#!/usr/bin/env python3
"""
Writes the complete AndroidManifest.xml for RewardHub.
Run from codemagic.yaml AFTER `npx cap sync android`.
This replaces fragile sed commands with a deterministic write.
"""

import os

MANIFEST_PATH = "android/app/src/main/AndroidManifest.xml"

MANIFEST_CONTENT = '''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Network -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Ads -->
    <uses-permission android:name="com.google.android.gms.permission.AD_ID" />

    <!-- Push Notifications (Android 13+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">

        <!-- Main Capacitor Activity -->
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:launchMode="singleTask"
            android:theme="@style/AppTheme.NoActionBar">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="@string/custom_url_scheme" />
            </intent-filter>
        </activity>

        <!-- Capacitor Plugins Provider -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>

        <!-- AdMob App ID (REQUIRED — app crashes without this) -->
        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="ca-app-pub-1560161047680443~4972275282" />

        <!-- AdMob Ad Activity (REQUIRED for fullscreen rewarded/app-open ads) -->
        <activity
            android:name="com.google.android.gms.ads.AdActivity"
            android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|uiMode|screenSize|smallestScreenSize"
            android:theme="@android:style/Theme.Translucent" />

        <!-- FCM Default Notification Channel -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="rewardhub_default" />

        <!-- FCM Default Notification Icon (uses app icon) -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@mipmap/ic_launcher" />

        <!-- FCM Default Notification Color -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_color"
            android:resource="@color/colorPrimary" />

    </application>

</manifest>
'''

# Ensure directory exists
os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)

# Write the manifest
with open(MANIFEST_PATH, 'w') as f:
    f.write(MANIFEST_CONTENT)

print(f"✅ AndroidManifest.xml written to {MANIFEST_PATH}")

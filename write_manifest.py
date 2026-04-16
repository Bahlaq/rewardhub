#!/usr/bin/env python3
# v13.5.0 — Stable manifest with push permissions restored (2026-04-16).
#
# The crash we were chasing was a native FCM register() race on
# MainActivity recreation. v13.5.0 keeps that fix at two layers:
#
#   1. JS layer: notifications.ts uses a 10s delay + try/catch +
#      listeners-before-register sequence (see src/services/notifications.ts).
#   2. Manifest layer: MainActivity and AdActivity carry comprehensive
#      configChanges so the permission dialog cannot destroy the activity.
#
# With those in place, re-adding POST_NOTIFICATIONS and the FCM default
# channel meta-data is safe. Without them, push registration silently
# fails on Android 13+ and Samsung/Xiaomi OEMs that require explicit
# metadata to route FCM messages to our default channel.
import os
MANIFEST_PATH = "android/app/src/main/AndroidManifest.xml"
MANIFEST = '''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="com.google.android.c2dm.permission.RECEIVE" />
    <uses-permission android:name="com.google.android.gms.permission.AD_ID" />
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true"
        android:largeHeap="true">
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|density|fontScale|navigation|touchscreen|layoutDirection|mnc|mcc"
            android:exported="true"
            android:launchMode="singleTask"
            android:alwaysRetainTaskState="true"
            android:resizeableActivity="true"
            android:windowSoftInputMode="adjustResize"
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
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
        <!-- AdMob -->
        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="ca-app-pub-1560161047680443~4972275282" />
        <meta-data
            android:name="com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT"
            android:value="true" />
        <!-- FCM / Push Notifications — default channel routing -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="default" />
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@mipmap/ic_launcher" />
        <activity
            android:name="com.google.android.gms.ads.AdActivity"
            android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|uiMode|screenSize|smallestScreenSize|density|fontScale|layoutDirection"
            android:theme="@android:style/Theme.Translucent"
            android:exported="false"
            tools:replace="android:configChanges" />
    </application>
</manifest>
'''
os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
with open(MANIFEST_PATH, 'w') as f:
    f.write(MANIFEST)
print("OK: " + MANIFEST_PATH)

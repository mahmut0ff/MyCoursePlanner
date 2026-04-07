---
description: How to build and deploy the Android app for Play Store
---

# Android Build & Deploy Workflow

// turbo-all

## Prerequisites
- Android Studio installed (for first-time setup)
- Java 17+ installed (`java -version`)
- `google-services.json` placed in `android/app/`
- Keystore created and `keystore.properties` configured (see walkthrough)

## Steps

1. Build the web app
```powershell
npm run build
```

2. Sync web assets to Android
```powershell
npx cap sync android
```

3. Build release AAB (for Play Store upload)
```powershell
cd android
.\gradlew bundleRelease
```

4. Find the output file
```
android/app/build/outputs/bundle/release/app-release.aab
```

5. Upload to Google Play Console → Production → Create new release

## Quick Test (APK on Device)

1. Connect Android device via USB (enable Developer Options + USB Debugging)
```powershell
npm run mobile:run
```

## Open in Android Studio
```powershell
npm run mobile:open
```

## Version Bumping

Before each Play Store release, bump `versionCode` in `android/app/build.gradle`:
```groovy
versionCode 2       // increment by 1 each release
versionName "1.1.0"  // semantic version
```

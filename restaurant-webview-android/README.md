# MoBasket Delivery WebView Android

Standalone Android WebView app for `https://mobasket.in/delivery` using package `com.mobasket.delivery`.

## Build APK

1. Install Android SDK (Android 35).
2. Create `local.properties` in this folder:

```properties
sdk.dir=C:\\Users\\YOUR_USER\\AppData\\Local\\Android\\Sdk
```

3. Build debug APK:

```bash
./gradlew assembleDebug
```

4. Build release APK:

```bash
./gradlew assembleRelease
```

APK output path:
- `app/build/outputs/apk/debug/app-debug.apk`
- `app/build/outputs/apk/release/app-release.apk`

## Push notification behavior

- Firebase Cloud Messaging is configured via `app/google-services.json`.
- New token is synced to backend endpoint:
  - `https://api.mobasket.in/api/delivery/auth/fcm-token`
- High-importance channel `delivery_order_alerts` is created for heads-up (top popup) notifications.
- `DeliveryFirebaseMessagingService` shows a buzzing heads-up notification for new incoming order pushes.

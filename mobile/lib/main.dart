import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'app.dart';
import 'data/services/api_service.dart';
import 'core/services/app_open_ad_manager.dart';
import 'firebase_options.dart';

/// Handle background FCM messages (must be top-level).
@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage message) async {
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  debugPrint('[FCM] Background message: ${message.messageId}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Initialize AdMob
  MobileAds.instance.initialize();

  // Status bar style
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  // Lock to portrait
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Initialize FCM (non-blocking)
  _initFCM();

  // App Open Ad — show on launch and app resume
  final appOpenAdManager = AppOpenAdManager();
  appOpenAdManager.loadAd();
  final lifecycleReactor = AppLifecycleReactor(appOpenAdManager);
  lifecycleReactor.listenToAppStateChanges();

  runApp(const ProviderScope(child: PlanulApp()));
}

/// Initialize Firebase Cloud Messaging:
/// - Request permission
/// - Get & save FCM token
/// - Listen for token refresh
void _initFCM() {
  try {
    final messaging = FirebaseMessaging.instance;

    // Register background handler
    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);

    // Request permission (iOS + Android 13+)
    messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint('[FCM] Foreground message: ${message.notification?.title}');
    });

    // Save token to backend once user is authenticated
    FirebaseAuth.instance.authStateChanges().listen((user) async {
      if (user == null) return;
      try {
        final token = await messaging.getToken();
        if (token != null) {
          final api = ApiService();
          await api.saveFcmToken(token);
          debugPrint('[FCM] Token saved');
        }
      } catch (e) {
        debugPrint('[FCM] Token save error: $e');
      }
    });

    // Listen for token refresh
    messaging.onTokenRefresh.listen((newToken) async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;
      try {
        final api = ApiService();
        await api.saveFcmToken(newToken);
        debugPrint('[FCM] Refreshed token saved');
      } catch (e) {
        debugPrint('[FCM] Refresh token save error: $e');
      }
    });
  } catch (e) {
    debugPrint('[FCM] Init error: $e');
  }
}

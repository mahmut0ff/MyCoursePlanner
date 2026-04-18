import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'firebase_options.dart';
import 'app.dart';
import 'core/services/app_open_ad_manager.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  MobileAds.instance.initialize();

  // App Open Ad — show on launch and app resume
  final appOpenAdManager = AppOpenAdManager();
  appOpenAdManager.loadAd();
  final lifecycleReactor = AppLifecycleReactor(appOpenAdManager);
  lifecycleReactor.listenToAppStateChanges();

  runApp(const ProviderScope(child: PlanulaSeniorApp()));
}

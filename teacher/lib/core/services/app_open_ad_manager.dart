import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

/// App Open Ad — shows a full-screen ad when the app is launched or resumed.
class AppOpenAdManager {
  static const String _adUnitId = 'ca-app-pub-1341261342994005/6769767560';

  AppOpenAd? _appOpenAd;
  bool _isShowingAd = false;
  DateTime? _appOpenLoadTime;

  static const Duration _maxCacheDuration = Duration(hours: 4);

  void loadAd() {
    AppOpenAd.load(
      adUnitId: _adUnitId,
      request: const AdRequest(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          debugPrint('[AdMob] App Open Ad loaded');
          _appOpenAd = ad;
          _appOpenLoadTime = DateTime.now();
        },
        onAdFailedToLoad: (error) {
          debugPrint('[AdMob] App Open Ad failed to load: ${error.message}');
        },
      ),
    );
  }

  bool get isAdAvailable {
    if (_appOpenAd == null) return false;
    if (_appOpenLoadTime != null &&
        DateTime.now().difference(_appOpenLoadTime!) > _maxCacheDuration) {
      _appOpenAd!.dispose();
      _appOpenAd = null;
      loadAd();
      return false;
    }
    return true;
  }

  void showAdIfAvailable() {
    if (!isAdAvailable) {
      loadAd();
      return;
    }
    if (_isShowingAd) return;

    _appOpenAd!.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        _isShowingAd = true;
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        debugPrint('[AdMob] App Open show failed: ${error.message}');
        _isShowingAd = false;
        ad.dispose();
        _appOpenAd = null;
        loadAd();
      },
      onAdDismissedFullScreenContent: (ad) {
        _isShowingAd = false;
        ad.dispose();
        _appOpenAd = null;
        loadAd();
      },
    );

    _appOpenAd!.show();
  }
}

class AppLifecycleReactor with WidgetsBindingObserver {
  final AppOpenAdManager appOpenAdManager;

  AppLifecycleReactor(this.appOpenAdManager);

  void listenToAppStateChanges() {
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      appOpenAdManager.showAdIfAvailable();
    }
  }
}

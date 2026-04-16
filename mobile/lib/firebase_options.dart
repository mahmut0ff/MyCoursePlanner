// File generated manually from existing Firebase web config.
// To regenerate, run: flutterfire configure

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBdmMh6av-czkmNDhAdcKlpdC1WPjs8L7k',
    appId: '1:646458638686:android:865b1db3590d9a261fcfcf',
    messagingSenderId: '646458638686',
    projectId: 'confident-totem-426112-j6',
    storageBucket: 'confident-totem-426112-j6.firebasestorage.app',
  );

  // Values from the existing .env / Firebase Console

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyBxc6ziiPSAcJuX7fcbcPTbx3K4nmcyXcQ',
    appId: '1:646458638686:ios:PLACEHOLDER', // TODO: replace after registering iOS app
    messagingSenderId: '646458638686',
    projectId: 'confident-totem-426112-j6',
    storageBucket: 'confident-totem-426112-j6.firebasestorage.app',
    iosBundleId: 'com.planula.app',
  );

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyBxc6ziiPSAcJuX7fcbcPTbx3K4nmcyXcQ',
    appId: '1:646458638686:web:deb5d61bb39e6b391fcfcf',
    messagingSenderId: '646458638686',
    projectId: 'confident-totem-426112-j6',
    storageBucket: 'confident-totem-426112-j6.firebasestorage.app',
    authDomain: 'confident-totem-426112-j6.firebaseapp.com',
  );
}
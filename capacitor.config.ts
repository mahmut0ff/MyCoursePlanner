import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.planula.app',
  appName: 'Planula',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',         // dark text on light bg
      backgroundColor: '#ffffff',
    },
  },
  // In production, the app ships with a bundled build (no server URL).
  // During development, you can uncomment the server block to use live reload:
  // server: {
  //   url: 'http://YOUR_LOCAL_IP:5173',
  //   cleartext: true,
  // },
  android: {
    allowMixedContent: false,   // force HTTPS
    backgroundColor: '#ffffff',
  },
  ios: {
    backgroundColor: '#ffffff',
    contentInset: 'always',     // Respect safe area insets
    scrollEnabled: true,
    allowsLinkPreview: false,   // Disable 3D Touch previews in WebView
  },
};

export default config;

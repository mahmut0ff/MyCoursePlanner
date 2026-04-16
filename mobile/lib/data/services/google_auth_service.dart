import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// Production-ready Google Sign-In service.
///
/// Flow:
/// 1. GoogleSignIn → get Google account
/// 2. Get GoogleSignInAuthentication (idToken + accessToken)
/// 3. Create Firebase OAuthCredential
/// 4. Sign in to Firebase Auth with credential
/// 5. Check if Firestore profile exists → create if not
class GoogleAuthService {
  static final _googleSignIn = GoogleSignIn(
    scopes: ['email', 'profile'],
  );

  /// Sign in with Google and return the Firebase [UserCredential].
  /// Returns null if the user cancelled the flow.
  /// Throws on network or auth errors.
  static Future<UserCredential?> signIn() async {
    // Step 1: Trigger Google sign-in flow
    final googleUser = await _googleSignIn.signIn();
    if (googleUser == null) return null; // User cancelled

    // Step 2: Obtain auth details
    final googleAuth = await googleUser.authentication;

    // Step 3: Create Firebase credential
    final credential = GoogleAuthProvider.credential(
      accessToken: googleAuth.accessToken,
      idToken: googleAuth.idToken,
    );

    // Step 4: Sign in to Firebase
    final userCredential =
        await FirebaseAuth.instance.signInWithCredential(credential);

    // Step 5: Ensure Firestore profile exists
    await _ensureFirestoreProfile(userCredential);

    return userCredential;
  }

  /// Sign out from both Google and Firebase.
  static Future<void> signOut() async {
    await _googleSignIn.signOut();
    await FirebaseAuth.instance.signOut();
  }

  /// Disconnect (revoke) Google account access.
  static Future<void> disconnect() async {
    try {
      await _googleSignIn.disconnect();
    } catch (_) {}
    await FirebaseAuth.instance.signOut();
  }

  /// Ensure Firestore `users/{uid}` document exists.
  /// If not, create it with data from the Google profile.
  /// This matches the web app's `createUser()` in `users.service.ts`.
  static Future<void> _ensureFirestoreProfile(
      UserCredential credential) async {
    final user = credential.user;
    if (user == null) return;

    final docRef =
        FirebaseFirestore.instance.collection('users').doc(user.uid);
    final doc = await docRef.get();

    if (!doc.exists) {
      // New user — build profile matching the web's createUser() schema.
      final now = DateTime.now().toIso8601String();
      await docRef.set({
        'uid': user.uid,
        'email': user.email ?? '',
        'displayName': user.displayName ?? '',
        'avatarUrl': user.photoURL ?? '',
        'role': 'student',
        'bio': '',
        'skills': <String>[],
        'city': '',
        'country': '',
        'username': '',
        'activeOrgId': '',
        'organizationId': '',
        'createdAt': now,
        'updatedAt': now,
      });
      debugPrint('[GoogleAuth] Created new Firestore profile for ${user.uid}');
    } else {
      // Existing user — update avatar if it changed (Google may rotate URLs)
      final data = doc.data();
      final currentAvatar = data?['avatarUrl'] ?? '';
      if (currentAvatar.isEmpty && (user.photoURL ?? '').isNotEmpty) {
        await docRef.update({
          'avatarUrl': user.photoURL,
          'updatedAt': DateTime.now().toIso8601String(),
        });
      }
    }
  }
}

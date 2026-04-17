import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameC = TextEditingController();
  final _emailC = TextEditingController();
  final _passC = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() { _nameC.dispose(); _emailC.dispose(); _passC.dispose(); super.dispose(); }

  Future<void> _register() async {
    if (_nameC.text.trim().isEmpty || _emailC.text.trim().isEmpty || _passC.text.isEmpty) {
      setState(() => _error = 'Заполните все поля');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final cred = await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: _emailC.text.trim(), password: _passC.text,
      );
      await cred.user?.updateDisplayName(_nameC.text.trim());
      // Create user profile in Firestore
      await FirebaseFirestore.instance.collection('users').doc(cred.user!.uid).set({
        'displayName': _nameC.text.trim(),
        'email': _emailC.text.trim(),
        'role': 'teacher',
        'createdAt': FieldValue.serverTimestamp(),
      });
      if (mounted) context.go('/');
    } on FirebaseAuthException catch (e) {
      setState(() => _error = switch (e.code) {
        'email-already-in-use' => 'Email уже используется',
        'weak-password' => 'Пароль слишком слабый',
        _ => 'Ошибка: ${e.message}',
      });
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _registerWithGoogle() async {
    setState(() { _loading = true; _error = null; });
    try {
      final googleUser = await GoogleSignIn().signIn();
      if (googleUser == null) {
        setState(() => _loading = false);
        return;
      }
      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      final cred = await FirebaseAuth.instance.signInWithCredential(credential);
      
      final docRef = FirebaseFirestore.instance.collection('users').doc(cred.user!.uid);
      final doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set({
          'displayName': cred.user!.displayName ?? 'Преподаватель',
          'email': cred.user!.email ?? '',
          'role': 'teacher',
          'createdAt': FieldValue.serverTimestamp(),
        });
      }
      
      if (mounted) context.go('/');
    } on FirebaseAuthException catch (e) {
      setState(() => _error = 'Ошибка Google: ${e.message}');
    } catch (e) {
      setState(() => _error = 'Ошибка: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [BoxShadow(color: const Color(0xFF7C3AED).withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 6))],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Image.asset('assets/images/planula_senior.png', fit: BoxFit.cover),
                  ),
                ),
                const SizedBox(height: 20),
                Text('Регистрация', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w800)),
                const SizedBox(height: 28),
                TextField(controller: _nameC, textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Имя', prefixIcon: Icon(Icons.person_outline))),
                const SizedBox(height: 14),
                TextField(controller: _emailC, keyboardType: TextInputType.emailAddress, textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email_outlined))),
                const SizedBox(height: 14),
                TextField(controller: _passC, obscureText: _obscure, onSubmitted: (_) => _register(),
                    decoration: InputDecoration(labelText: 'Пароль', prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _obscure = !_obscure)))),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: 8),
                    child: Text(_error!, style: TextStyle(color: theme.colorScheme.error, fontSize: 13))),
                const SizedBox(height: 20),
                SizedBox(width: double.infinity, height: 52,
                  child: FilledButton(
                    onPressed: _loading ? null : _register,
                    child: _loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Создать аккаунт'),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(width: double.infinity, height: 52,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      side: BorderSide(color: theme.colorScheme.outline.withValues(alpha: 0.2)),
                    ),
                    onPressed: _loading ? null : _registerWithGoogle,
                    icon: _loading ? const SizedBox.shrink() : const Icon(Icons.g_mobiledata, size: 28),
                    label: const Text('Через Google'),
                  ),
                ),
                const SizedBox(height: 12),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text('Уже есть аккаунт?', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                  TextButton(onPressed: () => context.go('/login'), child: const Text('Войти')),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }
}


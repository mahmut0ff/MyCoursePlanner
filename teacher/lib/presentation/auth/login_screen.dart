import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailC = TextEditingController();
  final _passC = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Auth redirect is now handled by GoRouter's refreshListenable + redirect.
    // No need for a manual authStateChanges listener here.
  }

  @override
  void dispose() {
    _emailC.dispose();
    _passC.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_emailC.text.trim().isEmpty || _passC.text.isEmpty) {
      setState(() => _error = 'Заполните все поля');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _emailC.text.trim(),
        password: _passC.text,
      );
      if (mounted) context.go('/');
    } on FirebaseAuthException catch (e) {
      setState(() => _error = switch (e.code) {
        'user-not-found' => 'Пользователь не найден',
        'wrong-password' => 'Неверный пароль',
        'invalid-credential' => 'Неверные данные для входа',
        _ => 'Ошибка входа: ${e.message}',
      });
    } catch (e) {
      setState(() => _error = 'Ошибка: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loginWithGoogle() async {
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
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF7C3AED).withValues(alpha: 0.3),
                        blurRadius: 24,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(22),
                    child: Image.asset('assets/images/planula_senior.png', fit: BoxFit.cover),
                  ),
                ),
                const SizedBox(height: 24),
                Text('Planula Senior',
                    style: GoogleFonts.inter(
                      fontSize: 28, fontWeight: FontWeight.w800,
                      color: theme.colorScheme.onSurface,
                    )),
                const SizedBox(height: 6),
                Text('Платформа для преподавателей',
                    style: TextStyle(
                      fontSize: 14,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    )),
                const SizedBox(height: 36),

                TextField(
                  controller: _emailC,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                ),
                const SizedBox(height: 14),

                TextField(
                  controller: _passC,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _login(),
                  decoration: InputDecoration(
                    labelText: 'Пароль',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                ),
                const SizedBox(height: 8),

                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(_error!,
                        style: TextStyle(color: theme.colorScheme.error, fontSize: 13)),
                  ),

                const SizedBox(height: 16),

                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: _loading ? null : _login,
                    child: _loading
                        ? const SizedBox(width: 20, height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Войти'),
                  ),
                ),
                const SizedBox(height: 16),
                
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      side: BorderSide(color: theme.colorScheme.outline.withValues(alpha: 0.2)),
                    ),
                    onPressed: _loading ? null : _loginWithGoogle,
                    icon: _loading
                        ? const SizedBox.shrink()
                        : const Icon(Icons.g_mobiledata, size: 28),
                    label: const Text('Войти через Google'),
                  ),
                ),
                const SizedBox(height: 16),

                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Нет аккаунта?',
                        style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                    TextButton(
                      onPressed: () => context.go('/register'),
                      child: const Text('Зарегистрироваться'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}


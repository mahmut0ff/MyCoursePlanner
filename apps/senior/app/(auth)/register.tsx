import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signUp } from '../../src/lib/auth';

/**
 * Self-service registration is teacher/student only. Owners of учебных
 * центров are provisioned by super-admins after a demo call — same rule as
 * on the web. We default this app to teacher.
 */
export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name || !email || !password) {
      Alert.alert('Заполните все поля');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Пароль должен быть не короче 6 символов');
      return;
    }
    setLoading(true);
    try {
      const cred = await signUp(email.trim(), password);
      // TODO: write users/{uid} doc with { name, role: 'teacher' } via the
      // shared API client once the corresponding Netlify Function is exposed
      // (api-users PUT). Auth-guard will redirect to the tabs as soon as
      // the Firebase auth state flips.
      void cred;
    } catch (e: any) {
      Alert.alert('Не удалось создать аккаунт', e?.message || 'Попробуйте ещё раз');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="px-6 pt-10 pb-10">
          <Text className="text-3xl font-bold text-slate-900 mb-2">Регистрация</Text>
          <Text className="text-base text-slate-500 mb-8">
            Создайте аккаунт преподавателя.
          </Text>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-700 mb-1.5">Имя</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Айбек Турсунов"
              placeholderTextColor="#94a3b8"
              className="border border-slate-200 rounded-2xl px-4 py-3.5 text-base"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-700 mb-1.5">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="aibek@example.kg"
              placeholderTextColor="#94a3b8"
              className="border border-slate-200 rounded-2xl px-4 py-3.5 text-base"
            />
          </View>

          <View className="mb-6">
            <Text className="text-sm font-semibold text-slate-700 mb-1.5">Пароль</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              className="border border-slate-200 rounded-2xl px-4 py-3.5 text-base"
            />
          </View>

          <Pressable
            onPress={submit}
            disabled={loading}
            className="bg-brand-600 active:bg-brand-700 disabled:opacity-60 rounded-2xl py-4 items-center"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-bold text-base">Создать аккаунт</Text>
            )}
          </Pressable>

          <View className="flex-row justify-center mt-6">
            <Text className="text-slate-500">Уже есть аккаунт? </Text>
            <Link href="/(auth)/login" className="text-brand-600 font-semibold">
              Войти
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

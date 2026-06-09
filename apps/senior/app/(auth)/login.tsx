import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signIn } from '../../src/lib/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      Alert.alert('Заполните все поля');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      Alert.alert('Не удалось войти', e?.message || 'Проверьте данные и попробуйте ещё раз');
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
        <View className="flex-1 px-6 pt-10">
          <Text className="text-3xl font-bold text-slate-900 mb-2">Добро пожаловать</Text>
          <Text className="text-base text-slate-500 mb-8">
            Планула Senior — для преподавателей.
          </Text>

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
              <Text className="text-white font-bold text-base">Войти</Text>
            )}
          </Pressable>

          <View className="flex-row justify-center mt-6">
            <Text className="text-slate-500">Нет аккаунта? </Text>
            <Link href="/(auth)/register" className="text-brand-600 font-semibold">
              Создать
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

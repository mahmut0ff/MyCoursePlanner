import { LogOut, User } from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOut } from '../../src/lib/auth';

export default function ProfileScreen() {
  const onSignOut = async () => {
    try {
      await signOut();
    } catch (e: any) {
      Alert.alert('Не удалось выйти', e?.message || '');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      <View className="flex-1 px-5 pt-4">
        <Text className="text-2xl font-bold text-slate-900 mb-1">Профиль</Text>
        <Text className="text-sm text-slate-500 mb-6">
          Аккаунт, организация, уведомления.
        </Text>

        <View className="bg-white rounded-2xl border border-slate-100 p-5 flex-row items-center gap-4 mb-4">
          <View className="w-12 h-12 rounded-2xl bg-brand-50 items-center justify-center">
            <User size={22} color="#7C3AED" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-slate-900">Преподаватель</Text>
            <Text className="text-xs text-slate-500 mt-0.5">Данные подключим в следующем шаге</Text>
          </View>
        </View>

        <Pressable
          onPress={onSignOut}
          className="bg-white rounded-2xl border border-slate-100 p-5 flex-row items-center gap-4"
        >
          <View className="w-10 h-10 rounded-xl bg-red-50 items-center justify-center">
            <LogOut size={18} color="#DC2626" />
          </View>
          <Text className="text-base font-semibold text-red-600">Выйти</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

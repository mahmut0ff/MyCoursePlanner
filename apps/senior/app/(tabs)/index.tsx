import { useQuery } from '@tanstack/react-query';
import { BookOpen, ClipboardCheck, FileQuestion, Radio } from 'lucide-react-native';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/lib/api';

/**
 * Home screen — same KPI tiles the Flutter Senior dashboard had:
 * lessons, exams, active rooms, pending homework + greeting card.
 * Data comes from the shared @planula/api client.
 */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

interface KpiTileProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  tint: string;
}

function KpiTile({ label, value, icon: Icon, tint }: KpiTileProps) {
  return (
    <View className="flex-1 bg-white rounded-2xl border border-slate-100 p-4">
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mb-3"
        style={{ backgroundColor: tint }}
      >
        <Icon size={20} color="#ffffff" />
      </View>
      <Text className="text-2xl font-bold text-slate-900">{value}</Text>
      <Text className="text-xs text-slate-500 mt-0.5">{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  const lessonsCount = data?.lessonsCount ?? 0;
  const examsCount = data?.examsCount ?? 0;
  const activeRoomsCount = data?.activeRoomsCount ?? 0;
  const pendingHomeworkCount = data?.pendingHomeworkCount ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-5 pt-2 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7C3AED" />}
      >
        <View className="bg-brand-50 rounded-3xl p-5 mb-5">
          <Text className="text-sm text-brand-700 font-semibold">{greeting()}</Text>
          <Text className="text-2xl font-bold text-slate-900 mt-1">Преподаватель</Text>
          <Text className="text-sm text-slate-500 mt-1">
            Сводка по вашим занятиям.
          </Text>
        </View>

        {isLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator color="#7C3AED" />
          </View>
        ) : (
          <>
            <View className="flex-row gap-3 mb-3">
              <KpiTile label="Уроков" value={lessonsCount} icon={BookOpen} tint="#7C3AED" />
              <KpiTile label="Экзаменов" value={examsCount} icon={FileQuestion} tint="#10B981" />
            </View>
            <View className="flex-row gap-3">
              <KpiTile label="Активных комнат" value={activeRoomsCount} icon={Radio} tint="#F59E0B" />
              <KpiTile label="Ожидают проверки" value={pendingHomeworkCount} icon={ClipboardCheck} tint="#EF4444" />
            </View>
          </>
        )}

        <Text className="text-base font-bold text-slate-900 mt-8 mb-3">Скоро здесь</Text>
        <View className="bg-white rounded-2xl border border-slate-100 p-5">
          <Text className="text-sm text-slate-500 leading-5">
            Последние уроки и экзамены, быстрые действия, переключатель организаций —
            добавим в следующих коммитах.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

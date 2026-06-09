import type { ComponentType } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ size?: number; color?: string }>;
}

/**
 * Placeholder block used while we port the Senior screens one by one.
 * Each tab gets a clear "what will live here" message instead of a blank
 * panel, so we always know which screen we're staring at.
 */
export function ScreenPlaceholder({ title, subtitle, icon: Icon }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-16 h-16 rounded-2xl bg-brand-50 items-center justify-center mb-4">
          <Icon size={28} color="#7C3AED" />
        </View>
        <Text className="text-xl font-bold text-slate-900 mb-2">{title}</Text>
        {subtitle ? (
          <Text className="text-sm text-slate-500 text-center leading-5">{subtitle}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

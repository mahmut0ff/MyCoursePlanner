import { Calendar } from 'lucide-react-native';
import { ScreenPlaceholder } from '../../src/components/ScreenPlaceholder';

export default function ScheduleScreen() {
  return (
    <ScreenPlaceholder
      title="Расписание"
      subtitle="Календарь занятий, быстрое создание событий и просмотр дня."
      icon={Calendar}
    />
  );
}

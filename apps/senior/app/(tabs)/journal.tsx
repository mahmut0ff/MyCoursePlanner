import { ClipboardCheck } from 'lucide-react-native';
import { ScreenPlaceholder } from '../../src/components/ScreenPlaceholder';

export default function JournalScreen() {
  return (
    <ScreenPlaceholder
      title="Журнал"
      subtitle="Две вкладки: Посещаемость и Оценки. Фильтры по курсу, группе и дате."
      icon={ClipboardCheck}
    />
  );
}

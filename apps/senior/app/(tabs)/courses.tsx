import { BookOpen } from 'lucide-react-native';
import { ScreenPlaceholder } from '../../src/components/ScreenPlaceholder';

export default function CoursesScreen() {
  return (
    <ScreenPlaceholder
      title="Курсы"
      subtitle="Список курсов, группы внутри каждого курса, уроки и студенты группы."
      icon={BookOpen}
    />
  );
}

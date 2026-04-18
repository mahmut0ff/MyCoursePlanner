import 'package:flutter/material.dart';

/// Legal / License agreement screen for Planula Senior.
class LicensesScreen extends StatelessWidget {
  const LicensesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Правовая информация')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ── Company Header ──
          Center(
            child: Column(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.school_rounded, color: theme.colorScheme.primary, size: 28),
                ),
                const SizedBox(height: 12),
                Text('Planula Systems', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  'Платформа для управления учебными центрами',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),

          _LegalSection(
            title: 'Лицензионное соглашение',
            icon: Icons.description_outlined,
            content: '''
Настоящее Лицензионное соглашение (далее — «Соглашение») является юридически обязывающим документом между вами (далее — «Пользователь») и компанией Planula Systems (далее — «Компания»).

Используя мобильное приложение Planula Senior (далее — «Приложение»), вы подтверждаете, что ознакомились с данным Соглашением и принимаете все его условия.

1. ПРЕДМЕТ СОГЛАШЕНИЯ
Компания предоставляет Пользователю неисключительную, непередаваемую лицензию на использование Приложения для управления учебным процессом в рамках учебных центров, зарегистрированных на платформе.

2. ПРАВА И ОБЯЗАННОСТИ
Пользователь обязуется:
• Использовать Приложение добросовестно и в соответствии с его назначением
• Не передавать свои учётные данные третьим лицам
• Не предпринимать попыток несанкционированного доступа к данным других пользователей
• Обеспечивать конфиденциальность данных студентов

3. ИНТЕЛЛЕКТУАЛЬНАЯ СОБСТВЕННОСТЬ
Все права на Приложение, включая дизайн, код, торговые марки и контент, принадлежат Planula Systems. Пользователю запрещается копирование, модификация или распространение любых элементов Приложения.

4. УЧЕБНЫЕ МАТЕРИАЛЫ
Материалы, размещённые преподавателями в Приложении, являются собственностью соответствующих авторов и/или организаций. Planula Systems не несёт ответственности за содержание таких материалов.
''',
          ),

          _LegalSection(
            title: 'Правила использования',
            icon: Icons.rule_outlined,
            content: '''
1. РЕГИСТРАЦИЯ И АККАУНТ
• Для использования Приложения необходимо создать аккаунт
• Пользователь несёт ответственность за достоверность предоставленных данных
• Один аккаунт — один пользователь

2. УПРАВЛЕНИЕ СТУДЕНТАМИ
• Преподаватель несёт ответственность за корректность выставленных оценок
• Данные посещаемости фиксируются и не могут быть произвольно изменены
• Доступ к данным студентов ограничен рамками организации

3. ОРГАНИЗАЦИИ
• Пользователь может являться преподавателем в нескольких учебных центрах
• Присвоение роли (teacher, admin, owner) осуществляется администратором организации
• Организация вправе исключить преподавателя за нарушение правил

4. КОНТЕНТ И ПОВЕДЕНИЕ
• Запрещается публикация оскорбительного, незаконного или вредоносного контента
• Нарушение данных правил может привести к блокировке аккаунта

5. PUSH-УВЕДОМЛЕНИЯ
• Приложение может отправлять push-уведомления о событиях учебного процесса
• Пользователь может управлять уведомлениями в настройках устройства
''',
          ),

          _LegalSection(
            title: 'Политика конфиденциальности',
            icon: Icons.privacy_tip_outlined,
            content: '''
1. СБОР ДАННЫХ
Мы собираем следующие данные:
• Имя, email, фотография профиля
• Данные об учебном процессе (курсы, оценки, расписание)
• Информация об устройстве для push-уведомлений

2. ИСПОЛЬЗОВАНИЕ ДАННЫХ
Данные используются исключительно для:
• Обеспечения функционирования Приложения
• Формирования статистики и отчётов для учебных центров
• Отправки уведомлений

3. ХРАНЕНИЕ И ЗАЩИТА
• Данные хранятся на серверах Google Firebase
• Передача данных осуществляется по зашифрованным каналам (TLS)
• Мы не продаём и не передаём данные третьим лицам в коммерческих целях

4. ПРАВА ПОЛЬЗОВАТЕЛЯ
• Вы можете запросить удаление своих данных, обратившись в поддержку
• Вы можете экспортировать данные учебного процесса
• Вы вправе отозвать согласие на обработку данных, прекратив использование Приложения
''',
          ),

          _LegalSection(
            title: 'Ограничение ответственности',
            icon: Icons.gavel_outlined,
            content: '''
1. Приложение предоставляется «как есть» (as-is). Компания не гарантирует бесперебойную работу Приложения.
2. Компания не несёт ответственности за убытки, возникшие в результате использования или невозможности использования Приложения.
3. Максимальная ответственность Компании ограничена суммой, уплаченной Пользователем за использование Приложения.
4. Компания оставляет за собой право изменять условия Соглашения с уведомлением пользователей.
''',
          ),

          const SizedBox(height: 16),
          Center(
            child: Text(
              '© ${DateTime.now().year} Planula Systems. Все права защищены.',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.35)),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              'Связь: support@planula.app',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.primary.withValues(alpha: 0.6), fontSize: 12),
            ),
          ),
          const SizedBox(height: 16),

          // Flutter licenses link
          Center(
            child: TextButton(
              onPressed: () => showLicensePage(
                context: context,
                applicationName: 'Planula Senior',
                applicationVersion: '1.0.0',
                applicationLegalese: '© 2026 Planula Systems',
              ),
              child: const Text('Лицензии открытых компонентов →'),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _LegalSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final String content;

  const _LegalSection({required this.title, required this.icon, required this.content});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.1)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                  child: Icon(icon, color: theme.colorScheme.primary, size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              content.trim(),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.7), height: 1.6),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

/// Legal / License agreement screen for Planula.
class LicensesScreen extends StatelessWidget {
  const LicensesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Правовая информация'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ── Company Header ──
          Center(
            child: Column(
              children: [
                Image.asset('assets/images/logo.png', height: 48),
                const SizedBox(height: 10),
                Text(
                  'Planula Systems',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Образовательная платформа',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),

          // ── License Agreement ──
          _LegalSection(
            title: 'Лицензионное соглашение',
            icon: Icons.description_outlined,
            content: '''
Настоящее Лицензионное соглашение (далее — «Соглашение») является юридически обязывающим документом между вами (далее — «Пользователь») и компанией Planula Systems (далее — «Компания»).

Используя мобильное приложение Planula (далее — «Приложение»), вы подтверждаете, что ознакомились с данным Соглашением и принимаете все его условия.

1. ПРЕДМЕТ СОГЛАШЕНИЯ
Компания предоставляет Пользователю неисключительную, непередаваемую лицензию на использование Приложения для целей обучения в рамках учебных центров, зарегистрированных на платформе.

2. ПРАВА И ОБЯЗАННОСТИ
Пользователь обязуется:
• Использовать Приложение добросовестно и в соответствии с его назначением
• Не передавать свои учётные данные третьим лицам
• Не предпринимать попыток несанкционированного доступа к данным других пользователей
• Соблюдать правила учебных центров, в которых состоит

3. ИНТЕЛЛЕКТУАЛЬНАЯ СОБСТВЕННОСТЬ
Все права на Приложение, включая дизайн, код, торговые марки и контент, принадлежат Planula Systems. Пользователю запрещается копирование, модификация или распространение любых элементов Приложения.

4. УЧЕБНЫЕ МАТЕРИАЛЫ
Материалы, размещённые учебными центрами в Приложении, являются собственностью соответствующих организаций. Planula Systems не несёт ответственности за содержание таких материалов.
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

2. ЭКЗАМЕНЫ И ОЦЕНКИ
• Результаты экзаменов фиксируются автоматически и не могут быть изменены Пользователем
• Попытки нечестного прохождения экзаменов (использование сторонних источников, подмена данных) могут привести к блокировке аккаунта
• Система фиксирует попытки выхода из приложения во время экзамена

3. ОРГАНИЗАЦИИ
• Пользователь может состоять в нескольких учебных центрах одновременно
• Вступление в организацию может требовать одобрения администратора
• Организация вправе исключить Пользователя за нарушение правил

4. КОНТЕНТ И ПОВЕДЕНИЕ
• Запрещается публикация оскорбительного, незаконного или вредоносного контента
• Нарушение данных правил может привести к временной или постоянной блокировке аккаунта

5. PUSH-УВЕДОМЛЕНИЯ
• Приложение может отправлять push-уведомления о расписании, оценках и событиях
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
• Результаты экзаменов и прогресс обучения
• Данные о посещаемости и активности
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
• Вы можете экспортировать свои результаты экзаменов
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
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.35),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              'Связь: support@planula.app',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.primary.withValues(alpha: 0.6),
                fontSize: 12,
              ),
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

  const _LegalSection({
    required this.title,
    required this.icon,
    required this.content,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.1),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon,
                    color: theme.colorScheme.primary, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    title,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              content.trim(),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                height: 1.6,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

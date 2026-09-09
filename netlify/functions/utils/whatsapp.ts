/**
 * WhatsApp Cloud API — запасной канал доставки.
 *
 * Зачем он вообще нужен рядом с Telegram. Telegram у нас бесплатный и богатый
 * (кнопки, ДЗ, вход), но он работает ТОЛЬКО для тех, кто дошёл до бота и нажал
 * /start. Родитель, который платит, чаще всего этого не сделал — а напоминание
 * о деньгах должно доходить именно до него. WhatsApp закрывает ровно этот
 * зазор, поэтому здесь он не «ещё одна рассылка», а запасной путь: пишем в него
 * только тем, до кого не дотянулся бесплатный канал (см. sendWhatsAppToUser).
 *
 * Почему всё через шаблоны. Вне 24-часового окна диалога Meta принимает только
 * заранее одобренные шаблоны; крон напоминаний по определению пишет первым, так
 * что произвольный текст отсюда невозможен в принципе. Отсюда и форма API:
 * имя шаблона + позиционные параметры, а не строка сообщения.
 *
 * Конфигурация — только через env, и модуль молчит, пока её нет:
 *   WHATSAPP_TOKEN            — токен доступа (постоянный, от системного
 *                               пользователя; временный из Meta живёт ~24 часа)
 *   WHATSAPP_PHONE_NUMBER_ID  — Phone Number ID отправителя
 *   WHATSAPP_API_VERSION      — версия Graph API (по умолчанию v23.0)
 *   WHATSAPP_DEFAULT_COUNTRY  — код страны для местных номеров (по умолчанию 996)
 *
 * Пока переменных нет, isWhatsAppConfigured() = false и ни одного запроса
 * наружу не уходит: код можно катить до одобрения шаблона и покупки номера.
 */
import { adminDb } from './firebase-admin';

/**
 * Env читаем на каждый вызов, а не при импорте модуля. Netlify переиспользует
 * инстанс функции между запросами, и значение, прочитанное на старте, пережило
 * бы смену токена в настройках сайта — при 24-часовом токене это гарантированная
 * тихая поломка.
 */
const token = () => process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';
const phoneNumberId = () => process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const apiVersion = () => process.env.WHATSAPP_API_VERSION || 'v23.0';
const defaultCountry = () => (process.env.WHATSAPP_DEFAULT_COUNTRY || '996').replace(/\D/g, '');

/** Канал включён только когда заданы обе половины доступа. */
export function isWhatsAppConfigured(): boolean {
  return Boolean(token() && phoneNumberId());
}

/**
 * Номер в вид, который принимает Cloud API: только цифры, с кодом страны.
 *
 * В базе телефоны вводят руками и как придётся: «+996 555 12-34-56»,
 * «0555123456», «555123456». Cloud API на неверный номер отвечает 200 и
 * молча ничего не доставляет, поэтому мусор лучше отсеять здесь.
 *
 * Возвращает null, если из строки не получается правдоподобный номер.
 */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  // Международный префикс набора: 00996… → 996…
  if (digits.startsWith('00')) digits = digits.slice(2);

  const cc = defaultCountry();
  // Местная запись: 0555123456 (ведущий ноль + 9 цифр) → 996555123456.
  if (digits.length === 10 && digits.startsWith('0')) digits = cc + digits.slice(1);
  // Номер без кода страны вовсе: 555123456 → 996555123456.
  else if (digits.length === 9) digits = cc + digits;

  // E.164 — от 8 до 15 цифр. Всё, что короче, это обрывок, а не телефон.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export interface WhatsAppTemplate {
  /** Имя одобренного шаблона, например payment_reminder_ru. */
  name: string;
  /** Код языка шаблона ровно в том виде, в каком он заведён в Meta. */
  language: string;
  /** Позиционные подстановки {{1}}, {{2}}, … в порядке тела шаблона. */
  params?: string[];
}

/**
 * Отправка шаблона на нормализованный номер. Никогда не бросает исключение:
 * недоступный WhatsApp не должен ронять крон, внутри которого он вызван.
 */
export async function sendWhatsAppTemplate(to: string, tpl: WhatsAppTemplate): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;

  // Параметр шаблона не может содержать перевод строки, табуляцию и длинные
  // пробельные пробелы — Meta отклоняет такое сообщение целиком (ошибка 132000).
  const params = (tpl.params || []).map(p => String(p ?? '').replace(/\s+/g, ' ').trim());

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion()}/${phoneNumberId()}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: tpl.name,
          language: { code: tpl.language },
          ...(params.length
            ? { components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }] }
            : {}),
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn(`WhatsApp send failed (${to}): ${res.status} ${err}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('WhatsApp API error:', e);
    return false;
  }
}

/**
 * Почему сообщение не ушло — для счётчиков в кронах и для логов. «Не отправили»
 * и «отправили, но не доставилось» это разные болезни, и лечатся они по-разному:
 * telegram_linked — так и задумано, no_phone — дыра в данных, api_error — Meta.
 */
export type WhatsAppOutcome =
  | 'sent'
  | 'not_configured'
  | 'telegram_linked'
  | 'user_missing'
  | 'no_phone'
  | 'bad_phone'
  | 'api_error';

/**
 * Запасная доставка пользователю: шлём, ТОЛЬКО если бесплатный канал до него
 * не дотягивается.
 *
 * Проверка привязки Telegram здесь, а не на стороне вызывающего, намеренно:
 * каждый шаблон стоит денег, и правило «не дублировать в двух мессенджерах»
 * должно быть одно на все будущие рассылки, а не переписываться в каждом кроне.
 */
export async function sendWhatsAppToUser(userId: string, tpl: WhatsAppTemplate): Promise<WhatsAppOutcome> {
  if (!isWhatsAppConfigured()) return 'not_configured';

  let user: any;
  try {
    const doc = await adminDb.collection('users').doc(userId).get();
    if (!doc.exists) return 'user_missing';
    user = doc.data();
  } catch (e) {
    console.warn(`WhatsApp: user read failed (${userId}):`, e);
    return 'user_missing';
  }

  if (user?.telegramChatId) return 'telegram_linked';
  if (!user?.phone) return 'no_phone';

  const to = normalizePhone(user.phone);
  if (!to) {
    console.warn(`WhatsApp: unusable phone for user ${userId}: ${user.phone}`);
    return 'bad_phone';
  }

  return (await sendWhatsAppTemplate(to, tpl)) ? 'sent' : 'api_error';
}

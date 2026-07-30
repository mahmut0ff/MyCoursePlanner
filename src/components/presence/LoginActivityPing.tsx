import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiPingTeacherActivity } from '../../lib/api';

/**
 * Отмечает «сотрудник вошёл» в журнале активности — один раз за сессию на пару
 * (пользователь, организация). В отличие от PresenceHeartbeat (частый пульс
 * присутствия) это разовое событие: сервер дедуплицирует входы до одного в день,
 * а модульный набор ключей гасит повторные вызовы при ремаунтах и навигации
 * внутри одной вкладки. Ключ включает orgId — после переключения организации
 * вход в неё отметится отдельно.
 *
 * Только для персонала (учителя/менеджеры/админы): у студентов вход не трекается,
 * и объём записи держится пропорционально тому, что реально показывается в KPI.
 */
const pingedKeys = new Set<string>();

const LoginActivityPing: React.FC = () => {
  const { firebaseUser, organizationId, configured, isStaff } = useAuth();
  const uid = firebaseUser?.uid;

  useEffect(() => {
    if (!configured || !uid || !organizationId || !isStaff) return;
    const key = `${uid}:${organizationId}`;
    if (pingedKeys.has(key)) return;
    pingedKeys.add(key);
    apiPingTeacherActivity().catch(() => {
      // Вход — best-effort. Сняли флаг, чтобы следующий маунт мог повторить попытку.
      pingedKeys.delete(key);
    });
  }, [configured, uid, organizationId, isStaff]);

  return null;
};

export default LoginActivityPing;

import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { startPresenceHeartbeat } from '../../services/presence.service';

/**
 * Invisible mount that keeps the signed-in user's presence heartbeat alive for
 * as long as they have an org context. Rendered once near the app root.
 *
 * Gated to STAFF (teacher / admin / manager) — the only roles whose presence is
 * surfaced anywhere in the app (the director's teacher list). Students, who
 * dominate an academy's user base, are excluded so presence write/read volume
 * stays proportional to what is actually displayed rather than to total signups.
 */
const PresenceHeartbeat: React.FC = () => {
  const { firebaseUser, organizationId, configured, isStaff } = useAuth();
  const uid = firebaseUser?.uid;

  useEffect(() => {
    if (!configured || !uid || !organizationId || !isStaff) return;
    return startPresenceHeartbeat(uid, organizationId);
  }, [configured, uid, organizationId, isStaff]);

  return null;
};

export default PresenceHeartbeat;

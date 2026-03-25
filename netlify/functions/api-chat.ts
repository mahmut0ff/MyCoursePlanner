/**
 * API: Chat System
 * Handles room creation, direct message deduplication,
 * participant management, and moderation actions.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const now = () => new Date().toISOString();

function orgQuery(collection: string, orgId: string) {
  return adminDb.collection(collection).where('organizationId', '==', orgId);
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!user.organizationId) return forbidden();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const orgId = user.organizationId;

  try {
    // 1. CREATE ROOM
    if (action === 'createRoom' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { type, title, description, imageUrl, participantIds } = body;
      
      if (!type || !['group', 'direct'].includes(type)) return badRequest('Invalid room type');
      if (!Array.isArray(participantIds) || participantIds.length === 0) return badRequest('participantIds array required');
      
      // Auto-include creator if not present
      if (!participantIds.includes(user.uid)) {
        participantIds.push(user.uid);
      }

      // Max participants safeguard
      if (participantIds.length > 500) return badRequest('Max 500 participants allowed per room');

      // Deduplicate Direct Messages deterministically
      if (type === 'direct') {
        if (participantIds.length !== 2) return badRequest('Direct rooms must have exactly 2 participants');
        
        // Deterministic ID: DM_orgId_uidA_uidB (sorted)
        const sortedUids = [...participantIds].sort();
        const deterministicId = `DM_${orgId}_${sortedUids[0]}_${sortedUids[1]}`;
        
        const existingDoc = await adminDb.collection('chatRooms').doc(deterministicId).get();
        if (existingDoc.exists) {
          // Un-archive if it was archived
          if (existingDoc.data()?.isArchived) {
            await existingDoc.ref.update({ isArchived: false, updatedAt: now() });
          }
          return ok({ id: deterministicId, ...existingDoc.data() });
        }

        // Create new DM
        const participantsMap: Record<string, any> = {};
        for (const uid of participantIds) {
          participantsMap[uid] = { role: 'member', joinedAt: now(), lastReadAt: '1970-01-01T00:00:00.000Z', isMuted: false, isRemoved: false };
        }

        const roomData = {
          id: deterministicId,
          organizationId: orgId,
          type: 'direct',
          createdBy: user.uid,
          participantIds,
          participants: participantsMap,
          lastMessageAt: now(),
          lastMessagePreview: 'Conversation started',
          isArchived: false,
          createdAt: now(),
          updatedAt: now()
        };
        
        await adminDb.collection('chatRooms').doc(deterministicId).set(roomData);
        return ok(roomData);
      }

      // Group Room Creation
      // Enforce organization chat settings (only admins/teachers can create usually, but let's assume UI checked it, or enforce here)
      if (hasRole(user, 'student')) {
        // Typically students can't create groups. Check org settings in production. For MVP, block students from creating groups.
        return forbidden('Students cannot create group rooms');
      }

      const participantsMap: Record<string, any> = {};
      for (const uid of participantIds) {
        participantsMap[uid] = { 
          role: uid === user.uid ? 'admin' : 'member', 
          joinedAt: now(), 
          lastReadAt: '1970-01-01T00:00:00.000Z', 
          isMuted: false, 
          isRemoved: false 
        };
      }

      const roomData = {
        organizationId: orgId,
        type: 'group',
        title: title || 'New Group',
        description: description || '',
        imageUrl: imageUrl || '',
        createdBy: user.uid,
        participantIds,
        participants: participantsMap,
        lastMessageAt: now(),
        lastMessagePreview: 'Group created',
        isArchived: false,
        createdAt: now(),
        updatedAt: now()
      };

      const ref = await adminDb.collection('chatRooms').add(roomData);
      await ref.update({ id: ref.id }); // Self-reference ID
      return ok({ id: ref.id, ...roomData });
    }


    // 2. UPDATE PARTICIPANTS
    if (action === 'updateParticipants' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { roomId, addUids, removeUids } = body;
      if (!roomId) return badRequest('roomId required');
      
      const roomRef = adminDb.collection('chatRooms').doc(roomId);
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) return notFound();
      
      const rData = roomDoc.data()!;
      if (rData.organizationId !== orgId) return forbidden();

      // Check caller's permission: Must be org admin or room admin
      const isRoomAdmin = rData.participants[user.uid]?.role === 'admin';
      const isOrgAdmin = hasRole(user, 'admin') || hasRole(user, 'super_admin');
      
      if (!isRoomAdmin && !isOrgAdmin) {
        return forbidden('Only room admins or organization admins can manage participants');
      }

      if (rData.type === 'direct') {
        return badRequest('Cannot modify participants of a direct message room');
      }

      let newParticipantIds = [...rData.participantIds];
      const newParticipantsMap = { ...rData.participants };

      // Add users
      if (Array.isArray(addUids)) {
        for (const uid of addUids) {
          if (!newParticipantIds.includes(uid)) {
            newParticipantIds.push(uid);
            newParticipantsMap[uid] = {
              role: 'member',
              joinedAt: now(),
              lastReadAt: '1970-01-01T00:00:00.000Z',
              isMuted: false,
              isRemoved: false
            };
          } else if (newParticipantsMap[uid]?.isRemoved) {
            // Re-adding a removed user
            newParticipantsMap[uid].isRemoved = false;
            newParticipantsMap[uid].joinedAt = now();
          }
        }
      }

      // Remove users (Soft remove: keep in participantIds for history query, but mark isRemoved = true)
      if (Array.isArray(removeUids)) {
        for (const uid of removeUids) {
          if (newParticipantsMap[uid]) {
            newParticipantsMap[uid].isRemoved = true;
            // Note: We don't remove them from `participantIds` array immediately 
            // so they can still query the room to see past history, but frontend rules/firebase rules 
            // will block them from reading new messages based on isRemoved check if we wanted. 
            // Actually, if we remove them from participantIds, they lose the ability to query the room entirely!
            // To satisfy: "он: не может читать новые сообщения, не может писать, но его старые сообщения остаются; UI: room исчезает или архивируется"
            // We should remove them from `participantIds` so the room disappears from their list.
            newParticipantIds = newParticipantIds.filter(id => id !== uid);
          }
        }
      }

      if (newParticipantIds.length > 500) return badRequest('Max 500 participants allowed per room');

      await roomRef.update({
        participantIds: newParticipantIds,
        participants: newParticipantsMap,
        updatedAt: now()
      });

      return ok({ success: true, participantIds: newParticipantIds });
    }

    // 3. ARCHIVE ROOM
    if (action === 'archiveRoom' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { roomId, isArchived } = body;
      if (!roomId) return badRequest('roomId required');
      
      const roomRef = adminDb.collection('chatRooms').doc(roomId);
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) return notFound();
      
      const rData = roomDoc.data()!;
      if (rData.organizationId !== orgId) return forbidden();

      const isRoomAdmin = rData.participants[user.uid]?.role === 'admin';
      const isOrgAdmin = hasRole(user, 'admin') || hasRole(user, 'super_admin');
      
      if (!isRoomAdmin && !isOrgAdmin) {
        return forbidden('Only room admins or organization admins can archive the room');
      }

      await roomRef.update({
        isArchived: !!isArchived,
        updatedAt: now()
      });

      return ok({ success: true, isArchived: !!isArchived });
    }

    // 4. MODERATE MESSAGE (Admin Hard Delete / Soft Delete via Backend)
    if (action === 'moderateMessage' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { roomId, messageId } = body;
      if (!roomId || !messageId) return badRequest('roomId and messageId required');
      
      const isOrgAdmin = hasRole(user, 'admin') || hasRole(user, 'super_admin');

      const msgRef = adminDb.collection('chatRooms').doc(roomId).collection('messages').doc(messageId);
      const msgDoc = await msgRef.get();
      
      if (!msgDoc.exists) return notFound();
      if (msgDoc.data()?.organizationId !== orgId) return forbidden();

      const isSender = msgDoc.data()?.senderId === user.uid;

      if (!isOrgAdmin && !isSender) return forbidden('Only org admins or the sender can delete this message');

      // Soft delete
      await msgRef.update({
        deletedAt: now(),
        deletedBy: user.uid,
        updatedAt: now()
      });

      return ok({ success: true });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-chat error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };

/**
 * Rooms Service — uses backend API for all operations.
 * Client-side Firestore reads were blocked by security rules
 * because they lacked the organizationId filter required by hasOrgAccess().
 * Now all reads go through the backend API which properly handles org-scoping.
 */
import { apiCreateRoom, apiJoinRoom, apiCloseRoom, apiStartRoom, apiGetRoomByCode, apiGetRoom, apiGetRooms, apiDeleteRoom } from '../lib/api';
import type { ExamRoom } from '../types';

export const createRoom = async (
  examId: string,
  examTitle: string,
  hostId: string,
  hostName: string,
  notifyOption: 'all' | 'group' | 'none' = 'none',
  notifyGroupId?: string
): Promise<ExamRoom> => {
  const result = await apiCreateRoom({ 
    examId, 
    examTitle, 
    authorId: hostId, 
    authorName: hostName, 
    notifyOption, 
    notifyGroupId 
  });
  return result as ExamRoom;
};

export const getRoomByCode = async (code: string): Promise<ExamRoom | null> => {
  try {
    const result = await apiGetRoomByCode(code.toUpperCase());
    return result as ExamRoom || null;
  } catch {
    return null;
  }
};

export const getRoom = async (id: string): Promise<ExamRoom | null> => {
  try {
    const result = await apiGetRoom(id);
    return result as ExamRoom;
  } catch {
    return null;
  }
};

export const getActiveRooms = async (): Promise<ExamRoom[]> => {
  // Сотруднику бэкенд отдаёт все комнаты организации, включая закрытые, —
  // а «Идут сейчас» на дашборде должен показывать только живые.
  const rooms = await apiGetRooms();
  return (rooms as ExamRoom[]).filter(r => r.status === 'active' || r.status === 'waiting');
};

export const getAllRooms = async (): Promise<ExamRoom[]> => {
  // Backend returns all rooms for staff (org-scoped)
  const rooms = await apiGetRooms();
  return rooms as ExamRoom[];
};

export const joinRoom = async (roomId: string, _studentId: string): Promise<void> => {
  await apiJoinRoom(roomId);
};

export const closeRoom = async (roomId: string): Promise<void> => {
  await apiCloseRoom(roomId);
};

/** Убрать закрытую комнату из списка (попытки учеников остаются). */
export const deleteRoom = async (roomId: string): Promise<void> => {
  await apiDeleteRoom(roomId);
};

export const startRoom = async (roomId: string): Promise<void> => {
  await apiStartRoom(roomId);
};

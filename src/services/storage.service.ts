import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/firebase';

export const uploadFile = async (
  path: string,
  file: File
): Promise<string> => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};

export const deleteFile = async (path: string): Promise<void> => {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (e) {
    console.warn('Failed to delete file:', e);
  }
};

export const uploadLessonCover = async (lessonId: string, file: File): Promise<string> => {
  const ext = file.name.split('.').pop();
  return uploadFile(`lessons/${lessonId}/cover.${ext}`, file);
};

export const uploadLessonImage = async (lessonId: string, file: File): Promise<string> => {
  const name = `${Date.now()}-${file.name}`;
  return uploadFile(`lessons/${lessonId}/images/${name}`, file);
};

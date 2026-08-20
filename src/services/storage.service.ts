import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, storage } from '../lib/firebase';

export const uploadFile = async (
  path: string,
  file: File | Blob
): Promise<string> => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};

export const uploadFileWithProgress = (
  path: string,
  file: File | Blob,
  onProgress: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file as Blob);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(Math.round(progress));
      },
      (error) => {
        reject(error);
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      }
    );
  });
};

export const deleteFile = async (path: string): Promise<void> => {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (e) {
    console.warn('Failed to delete file:', e);
  }
};

/**
 * Исходник для ИИ-генерации (лекция, PDF, скан). Путь обязан начинаться с uid —
 * storage.rules пускают в `ai-uploads/{uid}/` только самого владельца, иначе
 * прилетает storage/unauthorized.
 */
export const uploadAISource = async (file: File, prefix = ''): Promise<string> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Требуется вход в систему для загрузки файла.');
  const ext = (file.name.split('.').pop() || 'tmp').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'tmp';
  const name = `${prefix}${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
  return uploadFile(`ai-uploads/${uid}/${name}`, file);
};

export const uploadLessonCover = async (lessonId: string, file: File): Promise<string> => {
  const ext = file.name.split('.').pop();
  return uploadFile(`lessons/${lessonId}/cover.${ext}`, file);
};

export const uploadLessonImage = async (lessonId: string, file: File): Promise<string> => {
  const name = `${Date.now()}-${file.name}`;
  return uploadFile(`lessons/${lessonId}/images/${name}`, file);
};

export const uploadLessonAttachment = async (
  lessonId: string,
  file: File
): Promise<{ url: string; storagePath: string }> => {
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = `lessons/${lessonId}/attachments/${safeName}`;
  const url = await uploadFile(storagePath, file);
  return { url, storagePath };
};

export const deleteLessonAttachment = async (storagePath: string): Promise<void> => {
  await deleteFile(storagePath);
};

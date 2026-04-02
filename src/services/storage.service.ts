import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/firebase';

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

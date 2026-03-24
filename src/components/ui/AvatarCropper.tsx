import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Camera, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import getCroppedImg from '../../utils/cropImage';

interface AvatarCropperProps {
  imageSrc: string;
  onCropCancel: () => void;
  onCropComplete: (croppedBlob: Blob) => void;
}

const AvatarCropper: React.FC<AvatarCropperProps> = ({ imageSrc, onCropCancel, onCropComplete }) => {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const onCropCompleteEvent = useCallback((_croppedArea: any, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setLoading(true);
    try {
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (croppedImageBlob) {
        onCropComplete(croppedImageBlob);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary-500" />
            {t('common.cropAvatar', 'Position and Size')}
          </h2>
          <button onClick={onCropCancel} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="relative h-64 bg-slate-900 w-full overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteEvent}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-4 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-slate-500 dark:text-slate-400">Zoom</span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCropCancel}
              className="flex-1 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors border-0"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 py-2 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 border-0"
            >
              {loading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvatarCropper;

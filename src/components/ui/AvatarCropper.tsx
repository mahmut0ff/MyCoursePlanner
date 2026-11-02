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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-[480px] shadow-pop overflow-hidden flex flex-col">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Camera className="w-3.5 h-3.5 text-slate-400" />
            {t('common.cropAvatar', 'Положение и размер')}
          </h2>
          <button onClick={onCropCancel} className="-mr-1 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 transition-colors">
            <X className="w-3.5 h-3.5" />
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

        <div className="px-4 pt-3 pb-4 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('common.zoom', 'Масштаб')}</span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-primary-600"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onCropCancel}
              className="btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="btn-primary inline-flex items-center gap-1.5"
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

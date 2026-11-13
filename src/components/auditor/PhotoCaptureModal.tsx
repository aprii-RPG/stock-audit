import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  MapPin,
  Clock,
  AlertCircle,
  X,
  RotateCcw,
  Check,
  Image as ImageIcon,
} from 'lucide-react';
import type { Audit, AuditItem } from '../../types';

export type PhotoSource = 'camera' | 'gallery';
export interface PhotoMeta {
  source: PhotoSource;
  gps?: { lat: number; lng: number; accuracy: number };
}

interface PhotoCaptureModalProps {
  audit: Audit;
  item: AuditItem;
  onPhotoSaved: (dataUrl: string, meta: PhotoMeta) => Promise<void>;
  onClose: () => void;
}

// Quality settings: long side up to 2000 px, JPEG quality 0.85 (lowered only if the file is too big)
const MAX_SIDE = 2000;
const MAX_BYTES = 2_500_000;

function renderToCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h)); // never enlarge a small photo
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  let quality = 0.85;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length * 0.75 > MAX_BYTES && quality > 0.6) {
    quality -= 0.05;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url;
}

export const PhotoCaptureModal: React.FC<PhotoCaptureModalProps> = ({
  audit,
  item,
  onPhotoSaved,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<{ dataUrl: string; source: PhotoSource } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Live camera
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera is not supported in this browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      } catch (err) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setCameraError(`Camera nahi khul paaya (${msg}). Camera ki permission do, ya gallery se photo chuno.`);
        }
      }
    })();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Real GPS only (no fake fallback)
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Is phone/browser mein GPS support nahi hai.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsError(null);
      },
      () => setGpsError('Location nahi mili. Location ki permission do.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const timeText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !cameraReady || !video.videoWidth) return;
    setIsProcessing(true);
    setMessage(null);
    try {
      const canvas = renderToCanvas(video, video.videoWidth, video.videoHeight);
      setCaptured({ dataUrl: canvasToJpeg(canvas), source: 'camera' });
    } catch {
      setMessage('Photo nahi ban paayi. Dobara try karo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Sirf photo (image) chuno.');
      return;
    }
    setIsProcessing(true);
    setMessage(null);
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = renderToCanvas(bmp, bmp.width, bmp.height);
      bmp.close?.();
      setCaptured({ dataUrl: canvasToJpeg(canvas), source: 'gallery' });
    } catch {
      setMessage('Ye photo khul nahi paayi. Dusri photo try karo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!captured) return;
    setIsProcessing(true);
    setMessage(null);
    try {
      await onPhotoSaved(captured.dataUrl, {
        source: captured.source,
        gps: captured.source === 'camera' && gps ? gps : undefined,
      });
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Photo upload nahi hui. Dobara try karo.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-blue-500/30 flex flex-col max-h-[95vh]">
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-white shrink-0">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
              Shelf Photo
            </span>
            <h3 className="text-sm sm:text-base font-bold text-white truncate mt-0.5">
              {item.product.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center gap-1.5 text-[11px] shrink-0">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-900/60 text-blue-200 border border-blue-700/60 font-medium">
            <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
            <span>{gps ? `GPS: ±${gps.accuracy}m` : gpsError ? 'GPS: nahi mila' : 'GPS dhoond raha hai...'}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 border border-slate-700 font-medium">
            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
            <span>{timeText}</span>
          </span>
        </div>

        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] overflow-hidden">
          {captured ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img src={captured.dataUrl} alt="Selected shelf" className="max-h-[380px] w-full object-contain" />
              <div className="absolute top-3 left-3 right-3 bg-black/70 text-white text-[10px] px-2 py-1 rounded">
                {captured.source === 'camera'
                  ? 'Live camera photo'
                  : 'Gallery photo selected'}
              </div>
            </div>
          ) : cameraError ? (
            <div className="p-6 text-center max-w-sm text-slate-300">
              <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-white mb-1">Camera available nahi hai</h4>
              <p className="text-xs text-slate-400 mb-4">{cameraError}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md min-h-[44px]"
              >
                Gallery se photo chuno
              </button>
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full max-h-[400px] object-cover" />
              <div className="absolute inset-6 border-2 border-dashed border-white/40 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                <span className="text-[10px] text-white/70 font-mono bg-black/40 px-2 py-0.5 rounded self-start">
                  Shelf aur batch saaf dikhao
                </span>
                <span className="text-[10px] text-white/70 font-mono bg-black/40 px-2 py-0.5 rounded self-end">
                  Bin {item.bin || '-'}
                </span>
              </div>
            </div>
          )}
        </div>

        {(message || (gpsError && !captured)) && (
          <div className="px-4 py-2 text-[11px] bg-amber-950/60 text-amber-200 border-t border-amber-800/50 shrink-0">
            {message || gpsError}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleGalleryFile} />

        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          {captured ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setCaptured(null);
                  setMessage(null);
                }}
                disabled={isProcessing}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 font-bold text-xs sm:text-sm hover:bg-slate-700 transition flex items-center justify-center gap-2 min-h-[48px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmSave}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 min-h-[48px]"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{isProcessing ? 'Uploading...' : 'Save Photo'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isProcessing}
                className="py-3 px-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 font-bold text-xs hover:bg-slate-700 transition flex items-center justify-center gap-2 min-h-[48px]"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Gallery</span>
              </button>
              <button
                type="button"
                disabled={isProcessing || !cameraReady}
                onClick={handleCapture}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#1D5FD1] to-blue-500 disabled:opacity-50 text-white font-black text-sm shadow-xl shadow-blue-500/25 active:scale-95 transition flex items-center justify-center gap-2 min-h-[50px]"
              >
                <Camera className="w-5 h-5 stroke-[2.5]" />
                <span>Capture Photo</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
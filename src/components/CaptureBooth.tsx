/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  FlipHorizontal,
  X,
  Zap,
  ZapOff,
  Sun,
  Timer,
  Minus,
  Plus,
} from 'lucide-react';
import { FrameLayoutType, PhotoFilterType } from '../types';
import { soundEffects } from '../services/soundEffects';

interface CaptureBoothProps {
  layout: FrameLayoutType;
  filter: PhotoFilterType;
  onCapturesComplete: (photos: string[]) => void;
  onCancel: () => void;
}

export const CaptureBooth: React.FC<CaptureBoothProps> = ({
  layout,
  filter,
  onCapturesComplete,
  onCancel,
}) => {
  const targetShotCount =
    layout === 'single_polaroid' ? 1 : layout === 'grid_4' ? 2 : layout === 'strip_3' ? 3 : 4;

  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [brightness, setBrightness] = useState<number>(100);
  const [flashEnabled, setFlashEnabled] = useState(true);
  const [timerDuration, setTimerDuration] = useState<3 | 5 | 10>(3);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Initialize camera
  useEffect(() => {
    let isMounted = true;

    async function startCamera() {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      try {
        const getMedia =
          navigator?.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) ||
          ((constraints: MediaStreamConstraints) =>
            new Promise<MediaStream>((resolve, reject) => {
              const legacyGetUserMedia =
                (navigator as any)?.getUserMedia ||
                (navigator as any)?.webkitGetUserMedia ||
                (navigator as any)?.mozGetUserMedia;
              if (legacyGetUserMedia) {
                legacyGetUserMedia.call(navigator, constraints, resolve, reject);
              } else {
                reject(new Error('Camera API not available'));
              }
            }));

        const stream = await getMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setIsCameraActive(true);
        setCameraError(null);
      } catch {
        if (!isMounted) return;
        setIsCameraActive(false);
        setCameraError('Camera access unavailable. Using studio simulation.');
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  // Flip camera (Front/Back)
  const toggleCameraFacing = () => {
    soundEffects.playTap();
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Start Countdown Sequence
  const startCountdown = () => {
    if (countdown !== null) return;
    soundEffects.playCountdownBeep(false);
    setCountdown(timerDuration);
  };

  // Countdown timer effect
  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 1) {
      const timer = setTimeout(() => {
        soundEffects.playCountdownBeep(false);
        setCountdown((c) => (c ? c - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (countdown === 1) {
      const timer = setTimeout(() => {
        soundEffects.playCountdownBeep(true);
        takeSnapshot();
        setCountdown(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Capture Snapshot
  const takeSnapshot = () => {
    soundEffects.playShutter();
    if (flashEnabled) {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 220);
    }

    let dataUrl = '';

    if (isCameraActive && videoRef.current && videoRef.current.videoWidth) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.save();
        // Brightness adjustments
        ctx.filter = `brightness(${brightness}%)`;

        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        dataUrl = canvas.toDataURL('image/jpeg', 0.94);
      }
    } else {
      // High-quality artistic fallback canvas
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      const hue = (currentShotIndex * 50 + 20) % 360;
      ctx.fillStyle = `hsl(${hue}, 20%, 93%)`;
      ctx.fillRect(0, 0, 800, 600);

      // Face silhouette
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(400, 260, 110, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(360, 240, 10, 0, Math.PI * 2);
      ctx.arc(440, 240, 10, 0, Math.PI * 2);
      ctx.fill();

      // Smile
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(400, 275, 50, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`PHOTO ${currentShotIndex + 1}`, 400, 480);

      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    }

    const nextPhotos = [...capturedPhotos, dataUrl];
    setCapturedPhotos(nextPhotos);

    const nextIndex = currentShotIndex + 1;
    if (nextIndex < targetShotCount) {
      setCurrentShotIndex(nextIndex);
      setTimeout(() => {
        soundEffects.playCountdownBeep(false);
        setCountdown(timerDuration);
      }, 1600);
    } else {
      soundEffects.playSuccessChime();
      setTimeout(() => {
        onCapturesComplete(nextPhotos);
      }, 600);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col items-center justify-between p-4 sm:p-6 bg-[#faf8f5] text-zinc-900 select-none overflow-hidden max-w-lg mx-auto w-full">
      {/* Flash effect overlay */}
      {isFlashing && (
        <div className="fixed inset-0 bg-white z-50 pointer-events-none transition-opacity duration-200" />
      )}

      {/* Top Header matching Still 643ff2f4.jpeg */}
      <div className="w-full flex items-center justify-between pb-2">
        <button
          onClick={() => {
            soundEffects.playTap();
            onCancel();
          }}
          className="p-2 rounded-full hover:bg-zinc-200/80 text-zinc-600 transition cursor-pointer"
          title="Exit to Layout"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h1 className="text-base sm:text-lg font-bold text-zinc-950">
            Photo {Math.min(currentShotIndex + 1, targetShotCount)} of {targetShotCount}
          </h1>
          <p className="text-xs text-zinc-500">
            {countdown !== null
              ? `Pose now! Capturing in ${countdown}...`
              : "Tap the shutter when you're ready"}
          </p>
        </div>

        <button
          onClick={toggleCameraFacing}
          title="Flip Camera"
          className="p-2 rounded-full hover:bg-zinc-200/80 text-zinc-600 transition cursor-pointer"
        >
          <FlipHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Camera Viewfinder matching Still 643ff2f4.jpeg */}
      <div className="relative w-full aspect-3/4 sm:aspect-4/5 max-h-[56vh] rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-200 shadow-md flex items-center justify-center my-auto">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            transform: `${facingMode === 'user' ? 'scaleX(-1)' : ''} scale(${zoomLevel})`,
            filter: `brightness(${brightness}%)`,
          }}
          className="w-full h-full object-cover transition-all duration-200"
        />

        {/* Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-30 animate-fadeIn">
            <span className="font-sans font-light text-8xl text-white drop-shadow-lg animate-pulse">
              {countdown}
            </span>
          </div>
        )}

        {/* Brightness / Exposure Slider matching Still 643ff2f4.jpeg */}
        <div className="absolute bottom-3 inset-x-6 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 shadow-xs max-w-xs w-full">
            <Sun className="w-3.5 h-3.5 text-white/80 shrink-0" />
            <input
              type="range"
              min="70"
              max="130"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full h-1 bg-white/40 rounded-lg appearance-none cursor-pointer accent-white"
            />
          </div>
        </div>

        {/* Camera fallback message */}
        {cameraError && !isCameraActive && (
          <div className="absolute inset-0 bg-zinc-100 flex flex-col items-center justify-center p-4 text-center z-10 text-zinc-800">
            <Camera className="w-8 h-8 text-zinc-400 mb-2" />
            <p className="text-xs text-zinc-500 mb-3">Camera simulated for this kiosk session</p>
            <button
              onClick={startCountdown}
              className="px-4 py-2 rounded-full bg-black text-white text-xs font-medium"
            >
              Snap Simulated Photo #{currentShotIndex + 1}
            </button>
          </div>
        )}
      </div>

      {/* Shot Progress Numbers matching Still 643ff2f4.jpeg: 1 2 3 4 */}
      <div className="flex items-center justify-center gap-6 my-2 text-xs font-medium text-zinc-400">
        {Array.from({ length: targetShotCount }).map((_, idx) => {
          const isDone = idx < capturedPhotos.length;
          const isCurrent = idx === currentShotIndex;
          return (
            <span
              key={idx}
              className={`transition-colors font-mono ${
                isCurrent
                  ? 'text-zinc-950 font-bold scale-110'
                  : isDone
                  ? 'text-zinc-950 font-semibold'
                  : 'text-zinc-400'
              }`}
            >
              {idx + 1}
            </span>
          );
        })}
      </div>

      {/* Shutter Row Controls matching Still 643ff2f4.jpeg */}
      <div className="w-full flex items-center justify-between px-6 pt-1">
        {/* Flash Toggle */}
        <button
          onClick={() => {
            soundEffects.playTap();
            setFlashEnabled((f) => !f);
          }}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition cursor-pointer ${
            flashEnabled
              ? 'bg-zinc-200 text-zinc-900'
              : 'bg-zinc-100 text-zinc-400'
          }`}
          title="Toggle Screen Flash"
        >
          {flashEnabled ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
        </button>

        {/* Big Circular iOS Shutter Button */}
        <button
          onClick={() => {
            soundEffects.playTap();
            startCountdown();
          }}
          disabled={countdown !== null || capturedPhotos.length >= targetShotCount}
          className="w-18 h-18 rounded-full border-4 border-zinc-300 p-1 flex items-center justify-center transition active:scale-90 cursor-pointer disabled:opacity-40"
          title="Take Photo"
        >
          <div className="w-full h-full rounded-full bg-black hover:bg-zinc-800 transition" />
        </button>

        {/* Zoom Indicator / Toggle */}
        <button
          onClick={() => {
            soundEffects.playTap();
            setZoomLevel((z) => (z === 1.0 ? 1.25 : z === 1.25 ? 1.5 : 1.0));
          }}
          className="flex items-center gap-0.5 px-2.5 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-mono font-medium transition cursor-pointer"
          title="Zoom Level"
        >
          <span>{zoomLevel.toFixed(1)}x</span>
        </button>
      </div>

      {/* Timer Selector Pills matching Still 643ff2f4.jpeg: 3s 5s 10s */}
      <div className="flex items-center gap-2 mt-3 text-xs">
        <Timer className="w-3.5 h-3.5 text-zinc-400" />
        {([3, 5, 10] as const).map((sec) => (
          <button
            key={sec}
            onClick={() => {
              soundEffects.playTap();
              setTimerDuration(sec);
            }}
            className={`px-3 py-1 rounded-full font-medium transition cursor-pointer ${
              timerDuration === sec
                ? 'bg-black text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {sec}s
          </button>
        ))}
      </div>
    </div>
  );
};

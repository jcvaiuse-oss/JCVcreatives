/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Camera,
  FlipHorizontal,
  Minus,
  Plus,
  Ticket,
} from 'lucide-react';
import { FrameLayoutType, FrameTheme, PhotoFilterType } from '../types';
import { soundEffects } from '../services/soundEffects';

interface FrameSelectorProps {
  selectedLayout: FrameLayoutType;
  onSelectLayout: (layout: FrameLayoutType) => void;
  selectedTheme: FrameTheme;
  onSelectTheme: (theme: FrameTheme) => void;
  selectedFilter: PhotoFilterType;
  onSelectFilter: (filter: PhotoFilterType) => void;
  onContinue: () => void;
  onBack: () => void;
}

interface LayoutItemConfig {
  id: FrameLayoutType;
  title: string;
  shots: number;
  subtitle: string;
  price: number;
  type: 'polaroid' | 'strip2' | 'strip3' | 'strip4';
}

const LAYOUTS: LayoutItemConfig[] = [
  {
    id: 'single_polaroid',
    title: 'Polaroid',
    shots: 1,
    subtitle: 'Classic vibes ♡',
    price: 20,
    type: 'polaroid',
  },
  {
    id: 'grid_4',
    title: 'Grid (2 shots)',
    shots: 2,
    subtitle: 'Two moments, more fun ♡',
    price: 25,
    type: 'strip2',
  },
  {
    id: 'strip_3',
    title: 'Grid (3 shots)',
    shots: 3,
    subtitle: 'More smiles, please! ♡',
    price: 30,
    type: 'strip3',
  },
  {
    id: 'strip_4',
    title: '4-Cut Strip',
    shots: 4,
    subtitle: 'More friends, more memories ♡',
    price: 40,
    type: 'strip4',
  },
];

const MiniLiveVideo: React.FC<{
  stream: MediaStream | null;
  facingMode: 'user' | 'environment';
  className?: string;
}> = ({ stream, facingMode, className = '' }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className={`w-full h-full bg-sky-50 flex items-center justify-center text-sky-500 overflow-hidden ${className}`}>
        <Camera className="w-2.5 h-2.5 opacity-60" />
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`w-full h-full object-cover pointer-events-none select-none ${
        facingMode === 'user' ? 'scale-x-[-1]' : ''
      } ${className}`}
    />
  );
};

export const FrameSelector: React.FC<FrameSelectorProps> = ({
  selectedLayout,
  onSelectLayout,
  onContinue,
  onBack,
}) => {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [copies, setCopies] = useState<number>(1);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Initialize camera for live preview above
  useEffect(() => {
    let isMounted = true;

    async function startCamera() {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
        setCameraStream(stream);
        setCameraActive(true);
      } catch {
        if (!isMounted) return;
        setCameraActive(false);
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [facingMode]);

  const toggleCameraFacing = () => {
    soundEffects.playTap();
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleContinue = () => {
    soundEffects.playTap();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    onContinue();
  };

  const handleBack = () => {
    soundEffects.playTap();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    onBack();
  };

  const currentOption = LAYOUTS.find((l) => l.id === selectedLayout) || LAYOUTS[2];
  const totalPrice = currentOption.price * copies;

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-xl mx-auto w-full select-none text-zinc-900 overflow-y-auto">
      {/* Top Header matching Still 44fabe33.jpeg */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-800 transition cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-zinc-400 text-sm">♡</span>
        </div>

        {/* Center Brand Icon */}
        <div className="w-7 h-7 rounded bg-black text-white flex items-center justify-center font-bold text-xs shadow-xs">
          J
        </div>

        {/* Right Note */}
        <div className="text-right text-[11px] font-serif italic text-zinc-500 leading-tight">
          Same Moments<br />Brighter Days ♡
        </div>
      </div>

      {/* Camera Live Preview Check Above (requested by user) */}
      <div className="relative w-full aspect-16/9 sm:aspect-2/1 rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200/90 shadow-xs mb-4 flex items-center justify-center">
        {cameraActive && cameraStream ? (
          <video
            ref={(el) => {
              if (el && el.srcObject !== cameraStream) {
                el.srcObject = cameraStream;
                el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-400 gap-1.5">
            <Camera className="w-6 h-6 opacity-40 text-zinc-700" />
            <span className="text-xs text-zinc-600 font-medium">Camera Preview</span>
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-md text-[10px] font-medium text-zinc-700 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Mirror Check</span>
        </div>

        {cameraActive && (
          <button
            onClick={toggleCameraFacing}
            title="Flip Camera"
            className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/90 backdrop-blur-md border border-zinc-200 text-zinc-700 hover:text-black transition cursor-pointer"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Title & Subtitle */}
      <div className="text-center mb-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">
          Pick your layout
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Choose how you want to capture your memories ♡
        </p>
      </div>

      {/* 2x2 Layout Grid matching Still 44fabe33.jpeg with LIVE PREVIEW inside each card */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {LAYOUTS.map((opt) => {
          const isSelected = selectedLayout === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => {
                soundEffects.playTap();
                onSelectLayout(opt.id);
              }}
              className={`relative p-3.5 rounded-2xl border transition-all text-center flex flex-col items-center justify-between cursor-pointer ${
                isSelected
                  ? 'border-zinc-950 bg-white ring-2 ring-zinc-950/10 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/60 shadow-2xs'
              }`}
            >
              {/* Top Row: Price badge and Checkmark */}
              <div className="w-full flex items-center justify-between text-xs">
                <span className="text-[11px] font-medium text-zinc-500">
                  P{opt.price}
                </span>
                {isSelected ? (
                  <div className="w-4 h-4 rounded-full bg-black text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                ) : (
                  <span className="text-[10px] text-zinc-300">♡</span>
                )}
              </div>

              {/* Layout Graphic with LIVE CAMERA PREVIEWS inside slots */}
              <div className="my-2.5 flex items-center justify-center h-22 w-full relative">
                {/* Decorative sparkles */}
                <span className="absolute left-2 top-1 text-[9px] text-zinc-300">♡</span>
                <span className="absolute right-2 bottom-1 text-[9px] text-zinc-300">✧</span>

                {opt.type === 'polaroid' && (
                  <div className="w-14 h-18 bg-white border border-zinc-200 rounded-sm shadow-xs flex flex-col items-center pt-1 px-1 pb-1.5">
                    <div className="w-11 h-11 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                    <span className="text-[6px] font-mono text-zinc-400 mt-0.5">polaroid</span>
                  </div>
                )}

                {opt.type === 'strip2' && (
                  <div className="w-12 h-18 bg-white border border-zinc-200 rounded-xs shadow-xs flex flex-col items-center justify-between py-1 px-1 gap-1">
                    <div className="w-9 h-7 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                    <div className="w-9 h-7 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                  </div>
                )}

                {opt.type === 'strip3' && (
                  <div className="w-11 h-20 bg-white border border-zinc-200 rounded-xs shadow-xs flex flex-col items-center justify-between py-1 px-1 gap-0.5">
                    <div className="w-8 h-5 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                    <div className="w-8 h-5 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                    <div className="w-8 h-5 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                  </div>
                )}

                {opt.type === 'strip4' && (
                  <div className="w-11 h-20 bg-white border border-zinc-200 rounded-xs shadow-xs flex flex-col items-center justify-between py-1 px-1 gap-0.5">
                    <div className="w-8 h-4 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                    <div className="w-8 h-4 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                    <div className="w-8 h-4 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                    <div className="w-8 h-4 bg-zinc-100 rounded-xs overflow-hidden border border-zinc-200/80">
                      <MiniLiveVideo stream={cameraStream} facingMode={facingMode} />
                    </div>
                  </div>
                )}
              </div>

              {/* Title & Subtitle */}
              <div>
                <div className="font-semibold text-xs sm:text-sm text-zinc-900">
                  {opt.title}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {opt.shots} {opt.shots === 1 ? 'photo' : 'photos'}
                </div>
                <div className="text-[10px] text-zinc-500 font-serif italic mt-0.5">
                  {opt.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Controls matching Still 44fabe33.jpeg */}
      <div className="mt-auto space-y-3.5 pt-2">
        {/* Copies Stepper */}
        <div className="flex items-center justify-center gap-3 text-xs text-zinc-600 font-medium">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">Print Copies</span>
          <button
            onClick={() => {
              soundEffects.playTap();
              setCopies((c) => Math.max(1, c - 1));
            }}
            className="w-6 h-6 rounded-full border border-zinc-300 flex items-center justify-center hover:bg-zinc-100 text-zinc-700 transition"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="font-bold text-sm text-zinc-900 min-w-[14px] text-center">{copies}</span>
          <button
            onClick={() => {
              soundEffects.playTap();
              setCopies((c) => Math.min(10, c + 1));
            }}
            className="w-6 h-6 rounded-full border border-zinc-300 flex items-center justify-center hover:bg-zinc-100 text-zinc-700 transition"
          >
            <Plus className="w-3 h-3" />
          </button>
          <span className="text-zinc-400">Total P{totalPrice}</span>
        </div>

        {/* Big Black Pill Button: > Continue • P20 */}
        <button
          onClick={handleContinue}
          className="w-full py-4 rounded-full bg-black hover:bg-zinc-800 text-white font-medium text-sm tracking-wide shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>Continue • P{totalPrice}</span>
        </button>

        {/* Subactions: Cancel & Buy Voucher */}
        <div className="flex items-center justify-center gap-6 text-xs text-zinc-500 pt-1">
          <button
            onClick={handleBack}
            className="hover:text-zinc-900 transition cursor-pointer"
          >
            Cancel
          </button>
          <span>•</span>
          <button
            onClick={handleBack}
            className="flex items-center gap-1 hover:text-zinc-900 transition cursor-pointer"
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>Buy a voucher</span>
          </button>
        </div>
      </div>
    </div>
  );
};

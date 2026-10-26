/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Sliders,
  Maximize,
  Minimize,
  Battery,
  Scroll,
} from 'lucide-react';
import { ScreenState, KioskTelemetry, RemoteKioskConfig } from '../types';
import { soundEffects } from '../services/soundEffects';

interface KioskNavBarProps {
  currentScreen: ScreenState;
  onNavigateScreen: (screen: ScreenState) => void;
  telemetry: KioskTelemetry;
  config: RemoteKioskConfig;
  onRequestAdmin: () => void;
}

export const KioskNavBar: React.FC<KioskNavBarProps> = ({
  currentScreen,
  onNavigateScreen,
  telemetry,
  config,
  onRequestAdmin,
}) => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);

    const fsChange = () => {
      const doc = document as any;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement));
    };
    document.addEventListener('fullscreenchange', fsChange);
    document.addEventListener('webkitfullscreenchange', fsChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      document.removeEventListener('fullscreenchange', fsChange);
      document.removeEventListener('webkitfullscreenchange', fsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    soundEffects.playTap();
    try {
      const doc = document as any;
      const docEl = document.documentElement as any;
      const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);

      if (!isFs) {
        if (typeof docEl?.requestFullscreen === 'function') {
          docEl.requestFullscreen().catch(() => {});
        } else if (typeof docEl?.webkitRequestFullscreen === 'function') {
          docEl.webkitRequestFullscreen();
        } else if (typeof docEl?.webkitRequestFullScreen === 'function') {
          docEl.webkitRequestFullScreen();
        } else if (typeof docEl?.mozRequestFullScreen === 'function') {
          docEl.mozRequestFullScreen();
        } else if (typeof docEl?.msRequestFullscreen === 'function') {
          docEl.msRequestFullscreen();
        }
      } else {
        if (typeof doc?.exitFullscreen === 'function') {
          doc.exitFullscreen().catch(() => {});
        } else if (typeof doc?.webkitExitFullscreen === 'function') {
          doc.webkitExitFullscreen();
        } else if (typeof doc?.mozCancelFullScreen === 'function') {
          doc.mozCancelFullScreen();
        } else if (typeof doc?.msExitFullscreen === 'function') {
          doc.msExitFullscreen();
        }
      }
    } catch {
      // Fullscreen not supported or blocked by browser/iframe policy
    }
  };

  const paperLow = telemetry.paperRemainingPercent < 20;

  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-zinc-200 text-zinc-700 px-4 py-2.5 flex items-center justify-between text-xs select-none z-40">
      {/* Left: Kiosk Info & Minimalist Branding */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            soundEffects.playTap();
            onNavigateScreen('attract');
          }}
          className="flex items-center gap-2.5 text-zinc-900 hover:opacity-80 transition tracking-wider cursor-pointer"
        >
          <div className="w-6 h-6 rounded-md bg-black text-white flex items-center justify-center font-mono font-bold text-xs shadow-xs">
            J
          </div>
          <span className="font-semibold tracking-wide text-xs text-zinc-900">
            JCVcreatives <span className="text-zinc-400 font-normal">/ Studio</span>
          </span>
        </button>

        <div className="hidden md:flex items-center gap-2 pl-3 border-l border-zinc-200 text-zinc-500">
          <span className="font-mono text-[11px] text-zinc-500">
            {config.kioskId}
          </span>
          <span className="text-[11px] text-zinc-300">•</span>
          <span className="text-[11px] text-zinc-500 truncate max-w-[180px]">{config.locationName}</span>
        </div>
      </div>

      {/* Center: Live Status Indicators (Monochrome & Understated) */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Thermal Paper Roll % */}
        <div
          title={`Paper Roll: ${telemetry.paperRemainingPercent}% remaining`}
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] ${
            paperLow
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-zinc-200 bg-zinc-50 text-zinc-600'
          }`}
        >
          <Scroll className="w-3.5 h-3.5 text-zinc-500" />
          <span>Paper {telemetry.paperRemainingPercent}%</span>
        </div>

        {/* Online / Offline badge */}
        <div
          title={isOnline ? 'Online Cloud Sync Active' : 'Offline Mode Active'}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600 text-[11px]"
        >
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-zinc-700" />
              <span className="hidden md:inline">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-zinc-400" />
              <span>Offline</span>
            </>
          )}
        </div>

        {/* Battery if available */}
        {telemetry.deviceBatteryLevel !== undefined && (
          <div className="hidden lg:flex items-center gap-1 text-zinc-500 text-[11px]">
            <Battery className="w-3.5 h-3.5 text-zinc-600" />
            <span>{telemetry.deviceBatteryLevel}%</span>
          </div>
        )}

        {/* Clock */}
        <span className="hidden sm:inline font-mono text-[11px] text-zinc-500">{timeStr}</span>
      </div>

      {/* Right Controls: Fullscreen, Admin */}
      <div className="flex items-center gap-1.5">

        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
          className="p-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 transition"
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => {
            soundEffects.playTap();
            onRequestAdmin();
          }}
          title="Admin Settings & Kiosk Diagnostics"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            currentScreen === 'admin'
              ? 'bg-black text-white border-black font-medium'
              : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Admin</span>
        </button>
      </div>
    </header>
  );
};

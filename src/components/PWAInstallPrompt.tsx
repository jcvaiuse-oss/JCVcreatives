/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Download, Tablet, X, WifiOff } from 'lucide-react';
import { soundEffects } from '../services/soundEffects';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    try {
      // Detect standalone mode (already installed PWA or Android WebView)
      const isStandalone =
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(isStandalone);

      // Detect iOS devices
      const userAgent = (window.navigator?.userAgent || '').toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
      setIsIOS(isIOSDevice);
    } catch {
      // Ignore in restricted WebViews
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    soundEffects.playTap();
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  return (
    <>
      {/* Offline Mode Toast Indicator */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-full bg-zinc-950/90 backdrop-blur-md px-4 py-2 text-xs font-medium text-zinc-200 shadow-2xl border border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <WifiOff className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
          <span className="text-[11px] tracking-wide">Offline mode active — captures queued for auto-sync.</span>
        </div>
      )}

      {/* In-App Tablet PWA Install Prompt Banner */}
      {!isInstalled && deferredPrompt && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/95 border border-zinc-700/80 shadow-2xl backdrop-blur-md max-w-sm text-zinc-100 animate-fadeIn">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
            <Tablet className="w-4 h-4 text-zinc-300" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold text-zinc-100 tracking-tight">Install Kiosk PWA</div>
            <div className="text-[10px] text-zinc-400">Run fullscreen kiosk without browser bars</div>
          </div>
          <button
            onClick={handleInstallClick}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-xs font-semibold text-zinc-950 shadow-sm transition active:scale-95"
          >
            Install
          </button>
        </div>
      )}

      {/* iOS Safari Guide */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100">
            <h3 className="text-sm font-semibold tracking-wide uppercase text-zinc-300 mb-2">Install on iPad / Tablet</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-5">
              1. Tap the Safari <span className="text-zinc-200 font-medium">Share</span> button in the top browser bar.<br />
              2. Scroll down and tap <span className="text-zinc-200 font-medium">Add to Home Screen</span>.<br />
              3. Launch from your home screen for clean fullscreen kiosk operation.
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-800 text-xs font-medium text-zinc-200 hover:bg-zinc-700 border border-zinc-700/60 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ScreenState,
  FrameLayoutType,
  FrameTheme,
  PhotoFilterType,
  PhotostripResult,
  RemoteKioskConfig,
  KioskTelemetry,
  PaymentTransaction,
} from './types';
import { FRAME_THEMES } from './services/frameTemplates';
import { remoteConfigService } from './services/remoteConfig';
import { analyticsService } from './services/analytics';
import { storageService } from './services/storage';
import { soundEffects } from './services/soundEffects';

// Components
import { KioskNavBar, lockKioskFullscreen, unlockKioskFullscreen } from './components/KioskNavBar';
import { AttractScreen } from './components/AttractScreen';
import { PaymentModal } from './components/PaymentModal';
import { FrameSelector } from './components/FrameSelector';
import { CaptureBooth } from './components/CaptureBooth';
import { EditorScreen } from './components/EditorScreen';
import { PrintAndShareScreen } from './components/PrintAndShareScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { GuestShareModal } from './components/GuestShareModal';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('attract');
  const [config, setConfig] = useState<RemoteKioskConfig>(remoteConfigService.getConfig());
  const [telemetry, setTelemetry] = useState<KioskTelemetry>(analyticsService.getTelemetry());

  // Session State
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [activePayment, setActivePayment] = useState<PaymentTransaction | null>(null);
  const [selectedLayout, setSelectedLayout] = useState<FrameLayoutType>('strip_3');
  const [selectedTheme, setSelectedTheme] = useState<FrameTheme>(FRAME_THEMES[0]);
  const [selectedFilter, setSelectedFilter] = useState<PhotoFilterType>('none');
  const [selectedCopies, setSelectedCopies] = useState<number>(1);
  const [selectedBrightness, setSelectedBrightness] = useState<number>(
    config.thermalPrinter?.brightness ?? 45
  );
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [finalizedResult, setFinalizedResult] = useState<PhotostripResult | null>(null);
  const [finalizedCanvas, setFinalizedCanvas] = useState<HTMLCanvasElement | null>(null);

  // Modals
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showMobileShareModal, setShowMobileShareModal] = useState(false);

  // Initialize config, telemetry, and check URL for direct mobile guest share (?share=...)
  useEffect(() => {
    remoteConfigService
      .init()
      .then((loadedConfig) => {
        setConfig(loadedConfig);
        setSelectedCopies(1);
        setSelectedBrightness(loadedConfig.thermalPrinter?.brightness ?? 45);
      })
      .catch(() => {});
    analyticsService.init().then(setTelemetry).catch(() => {});

    try {
      // Check if opened with ?share=... on a smartphone
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get('share');
      if (shareId) {
        storageService
          .getCapture(shareId)
          .then((cap) => {
            if (cap) {
              setFinalizedResult(cap);
              setShowMobileShareModal(true);
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore URL parsing errors on non-standard schemes
    }
  }, []);

  // Handler: Start Session from Attract screen
  const handleStartSession = React.useCallback(() => {
    setSessionStartTime(Date.now());
    setSelectedCopies(1); // 1 Voucher = 1 Print Copy
    setSelectedBrightness(config.thermalPrinter?.brightness ?? 45);
    soundEffects.playTap();

    // Automatically lock tablet into Fullscreen Kiosk-Mode display upon session start if enabled
    if (config.autoFullscreenLock !== false) {
      lockKioskFullscreen(true);
    }

    // If free play mode active, skip payment gate straight to frame customization
    if (config.freePlayMode) {
      setCurrentScreen('frame_select');
    } else {
      setCurrentScreen('payment');
    }
  }, [
    config.freePlayMode,
    config.autoFullscreenLock,
    config.thermalPrinter?.brightness,
  ]);

  // Handler: Payment Succeeded
  const handlePaymentSuccess = (tx: PaymentTransaction) => {
    setActivePayment(tx);
    setSelectedCopies(1); // 1 Voucher = 1 Print Copy
    if (tx.layoutType) {
      setSelectedLayout(tx.layoutType);
    }
    setCurrentScreen('frame_select');
  };

  // Handler: Captures Completed
  const handleCapturesComplete = (photos: string[]) => {
    setCapturedPhotos(photos);
    setCurrentScreen('editor');
  };

  // Handler: Photostrip Finalized in Editor
  const handlePhotostripFinalized = async (result: PhotostripResult, canvas: HTMLCanvasElement) => {
    setFinalizedResult(result);
    setFinalizedCanvas(canvas);
    setCurrentScreen('print_share');

    // Save capture to local IndexedDB
    storageService.saveCapture(result).catch(() => {});

    // Record session metrics in analytics
    const durationSec = Math.round((Date.now() - sessionStartTime) / 1000);
    const revenue = activePayment ? activePayment.amount : 0;
    const copiesCount = Math.max(1, result.printCopies || selectedCopies || 1);
    analyticsService
      .recordSessionComplete({
        frameThemeId: result.themeId,
        filterId: result.filter,
        durationSec,
        printed: true,
        printCopies: copiesCount,
        revenueAdded: revenue,
      })
      .then(() => {
        setTelemetry({ ...analyticsService.getTelemetry() });
      })
      .catch(() => {});
  };

  // Handler: Return to Attract / Reset
  const handleResetToAttract = () => {
    setCapturedPhotos([]);
    setFinalizedResult(null);
    setFinalizedCanvas(null);
    setActivePayment(null);
    setSelectedCopies(1);
    setCurrentScreen('attract');
  };

  // Handler: Undo / Retake photos from Editor without resetting the paid session
  const handleRetakeFromEditor = () => {
    setCapturedPhotos([]);
    setFinalizedResult(null);
    setFinalizedCanvas(null);
    setCurrentScreen('capture');
  };

  return (
    <div className="flex flex-col h-dvh min-h-screen w-full bg-[#fafaf9] text-zinc-900 overflow-hidden font-sans select-none">
      {/* Kiosk Status & Hardware Bar */}
      <KioskNavBar
        currentScreen={currentScreen}
        onNavigateScreen={setCurrentScreen}
        telemetry={telemetry}
        config={config}
        onRequestAdmin={() => {
          unlockKioskFullscreen();
          setShowAdminModal(true);
        }}
      />

      {/* Screen Router */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* 1. Attract Screen */}
        {currentScreen === 'attract' && (
          <AttractScreen
            config={config}
            onStartSession={handleStartSession}
            onSecretAdminTap={() => {
              unlockKioskFullscreen();
              setShowAdminModal(true);
            }}
          />
        )}

        {/* 2. Payment & Voucher Gate */}
        {currentScreen === 'payment' && (
          <PaymentModal
            config={config}
            onPaymentSuccess={handlePaymentSuccess}
            onCancel={handleResetToAttract}
            onSecretAdminTap={() => {
              unlockKioskFullscreen();
              setShowAdminModal(true);
            }}
          />
        )}

        {/* 3. Frame & Filter Selector */}
        {currentScreen === 'frame_select' && (
          <FrameSelector
            selectedLayout={selectedLayout}
            onSelectLayout={setSelectedLayout}
            selectedTheme={selectedTheme}
            onSelectTheme={setSelectedTheme}
            selectedFilter={selectedFilter}
            onSelectFilter={setSelectedFilter}
            copies={1}
            onSelectCopies={setSelectedCopies}
            layoutPrices={config.layoutPrices}
            lockedLayout={activePayment?.layoutType}
            voucherCode={activePayment?.voucherCode}
            onContinue={() => setCurrentScreen('capture')}
            onBack={handleResetToAttract}
          />
        )}

        {/* 4. Live Camera Capture Booth */}
        {currentScreen === 'capture' && (
          <CaptureBooth
            layout={selectedLayout}
            filter={selectedFilter}
            onCapturesComplete={handleCapturesComplete}
            onCancel={() => setCurrentScreen('frame_select')}
          />
        )}

        {/* 5. Customization & Decoration Editor */}
        {currentScreen === 'editor' && (
          <EditorScreen
            photos={capturedPhotos}
            layout={selectedLayout}
            initialTheme={selectedTheme}
            initialFilter={selectedFilter}
            copies={selectedCopies}
            onChangeCopies={setSelectedCopies}
            brightness={selectedBrightness}
            onChangeBrightness={setSelectedBrightness}
            onFinalized={handlePhotostripFinalized}
            onRetake={handleRetakeFromEditor}
          />
        )}

        {/* 6. Print & Share Hub */}
        {currentScreen === 'print_share' && finalizedResult && finalizedCanvas && (
          <PrintAndShareScreen
            result={finalizedResult}
            canvas={finalizedCanvas}
            config={config}
            copies={selectedCopies}
            onDone={handleResetToAttract}
            onOpenMobileShareModal={() => setShowMobileShareModal(true)}
          />
        )}
      </main>

      {/* Admin Dashboard Modal */}
      {showAdminModal && (
        <AdminDashboard
          config={config}
          onUpdateConfig={(newConf) => {
            setConfig(newConf);
            if (newConf.thermalPrinter?.brightness !== undefined) {
              setSelectedBrightness(newConf.thermalPrinter.brightness);
            }
            if (newConf.thermalPrinter?.printCopies !== undefined && currentScreen === 'attract') {
              setSelectedCopies(Math.max(1, newConf.thermalPrinter.printCopies));
            }
            setTelemetry(analyticsService.getTelemetry());
          }}
          onClose={() => setShowAdminModal(false)}
        />
      )}

      {/* Mobile Guest Share View Simulation */}
      {showMobileShareModal && finalizedResult && (
        <GuestShareModal
          result={finalizedResult}
          onClose={() => setShowMobileShareModal(false)}
        />
      )}

      {/* PWA Install Prompt & Offline Connectivity Banner */}
      <PWAInstallPrompt />
    </div>
  );
}

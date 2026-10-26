/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import {
  Printer,
  QrCode,
  Mail,
  Download,
  RotateCcw,
  Sparkles,
  Smartphone,
  Check,
  X,
  Send,
  Loader2,
} from 'lucide-react';
import { PhotostripResult, ThermalPrinterConfig, RemoteKioskConfig } from '../types';
import { thermalPrinterService } from '../services/thermalPrinter';
import { emailDeliveryService } from '../services/email';
import { soundEffects } from '../services/soundEffects';
import { ThermalPrintPreviewModal } from './ThermalPrintPreviewModal';

interface PrintAndShareScreenProps {
  result: PhotostripResult;
  canvas: HTMLCanvasElement;
  config: RemoteKioskConfig;
  onDone: () => void;
  onOpenMobileShareModal: () => void;
}

export const PrintAndShareScreen: React.FC<PrintAndShareScreenProps> = ({
  result,
  canvas,
  config,
  onDone,
  onOpenMobileShareModal,
}) => {
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [activeCanvas, setActiveCanvas] = useState<HTMLCanvasElement>(canvas);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printedSuccessfully, setPrintedSuccessfully] = useState(false);
  const [qrShareDataUrl, setQrShareDataUrl] = useState<string>('');
  const [thermalPreviewUrl, setThermalPreviewUrl] = useState<string>(result.thermalRasterDataUrl || '');
  const [countdownSeconds, setCountdownSeconds] = useState(60);

  // Email form states
  const [emailInput, setEmailInput] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSentStatus, setEmailSentStatus] = useState<string | null>(null);

  // Dispenser animation
  const [feedAnimationKey, setFeedAnimationKey] = useState<number>(0);
  const [isFeeding, setIsFeeding] = useState<boolean>(true);

  const triggerFeedAnimation = (playSound: boolean = true) => {
    setFeedAnimationKey((prev) => prev + 1);
    setIsFeeding(true);
    if (playSound) soundEffects.playPrintingMotor();
    const timer = setTimeout(() => {
      setIsFeeding(false);
      if (playSound) soundEffects.playPaperCut();
    }, 2400);
    return timer;
  };

  useEffect(() => {
    const timer = triggerFeedAnimation(true);

    try {
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { x: 0.5, y: 0.4 },
        colors: ['#0f172a', '#71717a', '#a1a1aa', '#cbd5e1'],
      });
    } catch {
      // ignore
    }

    return () => {
      clearTimeout(timer);
      try {
        confetti.reset();
      } catch {}
    };
  }, []);

  // Generate Guest Sharing QR code
  useEffect(() => {
    QRCode.toDataURL(result.shareUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#18181b',
        light: '#ffffff',
      },
    }).then(setQrShareDataUrl);
  }, [result.shareUrl]);

  // Auto return countdown
  useEffect(() => {
    if (countdownSeconds <= 0) {
      onDone();
      return;
    }

    const timer = setInterval(() => {
      setCountdownSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdownSeconds, onDone]);

  // Execute print job
  const executePrintJob = async (
    targetCanvas: HTMLCanvasElement = activeCanvas,
    printerConfig: ThermalPrinterConfig = config.thermalPrinter
  ) => {
    soundEffects.playTap();
    setIsPrinting(true);

    const printResult = await thermalPrinterService.print(
      targetCanvas,
      printerConfig,
      () => {}
    );

    setIsPrinting(false);
    if (printResult.success) {
      setPrintedSuccessfully(true);
      triggerFeedAnimation(true);
      soundEffects.playSuccessChime();
    }
  };

  // Send photo email handler
  const handleSendEmail = async (emailToSubmit: string) => {
    const trimmed = emailToSubmit.trim();
    if (!trimmed || !trimmed.includes('@')) return;

    soundEffects.playTap();
    setIsSendingEmail(true);
    setEmailSentStatus(null);

    try {
      const response = await emailDeliveryService.sendPhotoEmail({
        recipientEmail: trimmed,
        photostripId: result.id,
        photostripUrl: result.compositeDataUrl, // Sends the full-color keepsake photostrip
        eventTitle: result.eventTitle || 'JCVcreatives Photobooth',
      });

      setEmailSentStatus(`Sent! Check ${trimmed} for your full-color strip & motion GIF.`);
      soundEffects.playSuccessChime();
    } catch {
      setEmailSentStatus('Delivery queued! Your photos will arrive shortly.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const appendDomain = (domain: string) => {
    soundEffects.playTap();
    const prefix = emailInput.split('@')[0] || '';
    setEmailInput(`${prefix}${domain}`);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-4 sm:p-6 bg-[#faf8f5] text-zinc-900 select-none overflow-y-auto max-w-md mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col items-center text-center">
        <div className="w-7 h-7 rounded bg-black text-white flex items-center justify-center font-bold text-xs shadow-xs mb-2">
          J
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">
          Your photos are ready
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {isFeeding ? 'Printing your receipt copy...' : 'Printed — grab your strip from the tray'}
        </p>
      </div>

      {/* Simulated Thermal Output Dispenser Slot */}
      <div className="my-auto w-full flex flex-col items-center py-2">
        {/* Output Slot Bezel */}
        <div className="w-64 sm:w-72 bg-zinc-200 border border-zinc-300 rounded-t-xl pt-2 px-3 pb-1 shadow-xs flex flex-col items-center">
          <div className="w-11/12 h-2 bg-black rounded-full" />
        </div>

        {/* Paper Chute holding photostrip (pure monochrome thermal print) */}
        <div className="w-64 sm:w-72 bg-white/40 border-x border-b border-zinc-200 rounded-b-xl p-2 pt-0 flex flex-col items-center overflow-hidden relative shadow-md">
          <div className="w-full overflow-hidden flex justify-center py-2">
            <div
              key={feedAnimationKey}
              className={`relative max-h-[44vh] flex flex-col items-center transition-transform ${
                isFeeding ? 'animate-thermalFeed' : ''
              }`}
            >
              <div className="relative rounded shadow-lg bg-white border border-zinc-200 overflow-hidden">
                <img
                  src={thermalPreviewUrl || result.thermalRasterDataUrl || result.compositeDataUrl}
                  alt="Printed Thermal Photostrip"
                  className="max-h-[40vh] w-auto object-contain select-none pointer-events-none"
                />
              </div>

              {/* Perforated tear line */}
              <div className="w-full mt-2 flex items-center justify-center gap-1.5 text-[8px] font-mono text-zinc-400 uppercase tracking-widest">
                <span>✂ TEAR HERE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Clarifying badge for guests */}
        <div className="mt-2 text-[10px] text-zinc-500 text-center flex items-center gap-1 bg-white px-3 py-1 rounded-full border border-zinc-200 shadow-2xs">
          <span>🖨️ Thermal receipt printed</span>
          <span>•</span>
          <span className="text-sky-600 font-medium">Scan QR or Email for full color & GIF</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full space-y-2 max-w-xs pt-1">
        {/* Button 1: Show QR Code */}
        <button
          onClick={() => {
            soundEffects.playTap();
            setShowQrModal(true);
          }}
          className="w-full py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs sm:text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <QrCode className="w-4 h-4 text-zinc-600" />
          <span>Show QR code (Save to phone)</span>
        </button>

        {/* Button 2: Send to Email */}
        <button
          onClick={() => {
            soundEffects.playTap();
            setEmailSentStatus(null);
            setShowEmailModal(true);
          }}
          className="w-full py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs sm:text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <Mail className="w-4 h-4 text-zinc-600" />
          <span>Send to Email (Color & GIF)</span>
        </button>

        {/* Button 3: Save Digital & GIF (Color gallery & motion player) */}
        <button
          onClick={() => {
            soundEffects.playTap();
            onOpenMobileShareModal();
          }}
          className="w-full py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs sm:text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-zinc-600" />
          <span>Save Digital & Motion GIF</span>
        </button>

        {/* Button 4: Print more • P5 */}
        <button
          disabled={isPrinting}
          onClick={() => executePrintJob()}
          className="w-full py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs sm:text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          <Printer className="w-4 h-4 text-zinc-600" />
          <span>{isPrinting ? 'Printing...' : 'Print more • P5'}</span>
        </button>

        {/* Button 5: Ready? Let's snap! */}
        <button
          onClick={() => {
            soundEffects.playTap();
            onDone();
          }}
          className="w-full py-3 rounded-full bg-black hover:bg-zinc-800 text-white text-xs sm:text-sm font-medium shadow-md active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-white" />
          <span>Ready? Let's snap!</span>
        </button>

        {/* Starting over countdown timer */}
        <div className="text-center pt-0.5 text-[11px] text-zinc-400">
          Starting over in {countdownSeconds}s
        </div>
      </div>

      {/* Modal 1: QR Code Modal with Built-in Email Input */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full text-center shadow-2xl border border-zinc-200 flex flex-col items-center">
            <div className="w-full flex justify-end">
              <button
                onClick={() => setShowQrModal(false)}
                className="text-zinc-400 hover:text-zinc-900 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-base font-bold text-zinc-950 mb-0.5">
              Scan with Smartphone
            </h3>
            <p className="text-xs text-zinc-500 mb-3">
              Download your full-color photostrip and animated motion GIF
            </p>

            <div className="p-2.5 bg-white border border-zinc-200 rounded-2xl shadow-xs mb-3">
              {qrShareDataUrl ? (
                <img src={qrShareDataUrl} alt="QR Code" className="w-40 h-40 object-contain" />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center text-xs text-zinc-400">
                  Generating QR...
                </div>
              )}
            </div>

            {/* Quick Email Send Form inside QR Modal */}
            <div className="w-full pt-2 border-t border-zinc-100 text-left mb-3">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                Or send photos & GIF to your email:
              </label>
              <div className="flex gap-1.5">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="your.email@example.com"
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-black bg-zinc-50"
                />
                <button
                  disabled={isSendingEmail || !emailInput.includes('@')}
                  onClick={() => handleSendEmail(emailInput)}
                  className="px-3 py-1.5 rounded-xl bg-black hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                >
                  {isSendingEmail ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send</span>
                </button>
              </div>

              {/* Status Message */}
              {emailSentStatus && (
                <div className="mt-2 text-[11px] text-emerald-600 bg-emerald-50 rounded-lg p-1.5 flex items-center gap-1.5 border border-emerald-200">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{emailSentStatus}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-medium cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Modal 2: Dedicated Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-200 flex flex-col items-center text-center">
            <div className="w-full flex justify-end">
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-zinc-400 hover:text-zinc-900 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mb-2">
              <Mail className="w-5 h-5" />
            </div>

            <h3 className="text-base font-bold text-zinc-950 mb-1">
              Email Full-Color Photos & GIF
            </h3>
            <p className="text-xs text-zinc-500 mb-3 max-w-xs leading-relaxed">
              We'll send your high-resolution color photostrip and animated motion reel directly to your inbox.
            </p>

            {/* Thumbnail of color keepsake strip */}
            <div className="w-24 h-32 rounded-lg overflow-hidden border border-zinc-200 shadow-sm mb-3 bg-zinc-50 flex items-center justify-center">
              <img
                src={result.compositeDataUrl}
                alt="Color Photostrip"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Email Input Field */}
            <div className="w-full space-y-2 mb-3">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Enter your email address..."
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-black text-xs text-zinc-900 bg-zinc-50"
              />

              {/* Fast Kiosk Domain Helper Buttons */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap text-[10px]">
                {['@gmail.com', '@yahoo.com', '@icloud.com', '@outlook.com'].map((domain) => (
                  <button
                    key={domain}
                    onClick={() => appendDomain(domain)}
                    className="px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-mono transition cursor-pointer"
                  >
                    {domain}
                  </button>
                ))}
              </div>
            </div>

            {emailSentStatus && (
              <div className="w-full mb-3 text-xs text-emerald-700 bg-emerald-50 rounded-xl p-2.5 flex items-center gap-2 border border-emerald-200 text-left">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{emailSentStatus}</span>
              </div>
            )}

            <button
              disabled={isSendingEmail || !emailInput.includes('@')}
              onClick={() => handleSendEmail(emailInput)}
              className="w-full py-3 rounded-full bg-black hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition flex items-center justify-center gap-2 cursor-pointer mb-2"
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending photos...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Photos & Motion GIF</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowEmailModal(false)}
              className="text-xs text-zinc-400 hover:text-zinc-700 py-1"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Thermal Preview Alignment Modal */}
      {showPrintPreview && (
        <ThermalPrintPreviewModal
          sourceCanvas={canvas}
          currentConfig={config.thermalPrinter}
          onConfirmPrint={(adjustedCanvas, adjustedConfig) => {
            setShowPrintPreview(false);
            setActiveCanvas(adjustedCanvas);
            executePrintJob(adjustedCanvas, adjustedConfig);
          }}
          onClose={() => setShowPrintPreview(false)}
        />
      )}
    </div>
  );
};

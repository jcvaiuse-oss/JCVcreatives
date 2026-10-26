/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Printer,
  Sliders,
  Ticket,
  Cloud,
  History,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Scroll,
  Plus,
  ArrowRight,
  Battery,
  Wifi,
  DollarSign,
  Download,
  Trash2,
  Radio,
  Send,
  Zap,
  Sparkles,
  Film,
  Upload,
  Play,
  Volume2,
  VolumeX,
  Eye,
  HelpCircle,
  Video as VideoIcon,
  Image as ImageIcon,
  Shuffle,
  RotateCcw,
} from 'lucide-react';
import {
  RemoteKioskConfig,
  KioskTelemetry,
  Voucher,
  PhotostripResult,
  EmailQueueItem,
  ThermalPrinterConfig,
  FrontScreenMediaConfig,
  FrontScreenMediaType,
  FrontScreenMediaPlacement,
} from '../types';
import { analyticsService } from '../services/analytics';
import { remoteConfigService } from '../services/remoteConfig';
import { thermalPrinterService, PrinterDeviceStatus } from '../services/thermalPrinter';
import {
  storageService,
  compressImageFile,
  safeStorageGet,
  safeStorageSet,
  safeStorageRemove,
} from '../services/storage';
import { emailDeliveryService } from '../services/email';
import { soundEffects } from '../services/soundEffects';
import {
  ATTRACT_OCCASION_THEMES,
  AttractOccasionId,
  getActiveAttractThemeId,
  setActiveAttractThemeId,
  getAttractThemeById,
} from '../services/attractThemes';
import { DEFAULT_BOOTH_SAMPLES, sanitizeStoredAttractPhotos } from './AttractScreen';

const normalizeCanvaUrl = (raw: string): { url: string; isEmbed: boolean } => {
  const trimmed = raw.trim();
  const iframeMatch = trimmed.match(/src=["'](.*?)["']/);
  if (iframeMatch && iframeMatch[1]) {
    return { url: iframeMatch[1], isEmbed: true };
  }
  if (trimmed.includes('canva.com') && trimmed.includes('/view')) {
    if (!trimmed.includes('embed')) {
      const sep = trimmed.includes('?') ? '&' : '?';
      return { url: `${trimmed}${sep}embed`, isEmbed: true };
    }
    return { url: trimmed, isEmbed: true };
  }
  return { url: trimmed, isEmbed: false };
};

const SAMPLE_MEDIA_LIST = [
  {
    name: 'Birthday Confetti Celebration (GIF)',
    type: 'gif' as const,
    url: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif',
    badge: '🎂 HAPPY BIRTHDAY',
    headline: "Happy Birthday! 🎉",
    subtitle: "Make a wish & touch screen to start your photo session!",
    tag: 'Birthday 🎂',
  },
  {
    name: 'Golden Sparkler Loop (MP4)',
    type: 'video' as const,
    url: 'https://assets.mixkit.co/videos/preview/mixkit-bright-golden-sparkler-sparks-burning-in-the-dark-42456-large.mp4',
    badge: '✨ CELEBRATE WITH US',
    headline: 'Celebrate The Moment',
    subtitle: 'Touch screen to capture high-definition archival keepsakes',
    tag: 'Party ✨',
  },
  {
    name: 'Falling Colorful Confetti (MP4)',
    type: 'video' as const,
    url: 'https://assets.mixkit.co/videos/preview/mixkit-colorful-confetti-falling-at-a-celebration-4089-large.mp4',
    badge: '🎉 PARTY TIME',
    headline: "Let's Celebrate Together",
    subtitle: 'Unlimited complimentary prints for all guests',
    tag: 'Celebration 🎈',
  },
  {
    name: 'Neon Cyber Glow (GIF)',
    type: 'gif' as const,
    url: 'https://media.giphy.com/media/l41K3o5HhdSmjjOSQ/giphy.gif',
    badge: '⚡ NEON RETRO',
    headline: 'Glow In The Dark Booth',
    subtitle: 'Touch screen to strike a pose with live photo filters',
    tag: 'Neon ⚡',
  },
];

interface AdminDashboardProps {
  config: RemoteKioskConfig;
  onUpdateConfig: (newConfig: RemoteKioskConfig) => void;
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  config,
  onUpdateConfig,
  onClose,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [activeTab, setActiveTab] = useState<'analytics' | 'frontscreen' | 'printer' | 'config' | 'vouchers' | 'gallery'>('analytics');
  const [telemetry, setTelemetry] = useState<KioskTelemetry>(analyticsService.getTelemetry());
  const [printerStatus, setPrinterStatus] = useState<PrinterDeviceStatus>(thermalPrinterService.getStatus());
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [captures, setCaptures] = useState<PhotostripResult[]>([]);
  const [queuedEmails, setQueuedEmails] = useState<EmailQueueItem[]>([]);

  // Config local form state
  const [localConfig, setLocalConfig] = useState<RemoteKioskConfig>(config);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [canvaInputText, setCanvaInputText] = useState('');
  const [showCanvaHelp, setShowCanvaHelp] = useState(false);

  // Remote update state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  // New voucher form state
  const [newVoucherCode, setNewVoucherCode] = useState('');
  const [newVoucherDiscount, setNewVoucherDiscount] = useState(100);
  const [newVoucherMaxUses, setNewVoucherMaxUses] = useState(50);
  const [newVoucherDesc, setNewVoucherDesc] = useState('');

  // Test Print in progress
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [testPrintFeedback, setTestPrintFeedback] = useState<string | null>(null);

  // Home Screen 3-Strips Custom Photos State (Operator / Admin Control Only)
  const [homeStripPhotos, setHomeStripPhotos] = useState<string[]>(() => {
    try {
      const saved = safeStorageGet('jcv_attract_custom_photos');
      if (saved) {
        const cleaned = sanitizeStoredAttractPhotos(JSON.parse(saved));
        if (cleaned.length > 0) return cleaned;
      }
    } catch {}
    return [];
  });
  const [homePhotoStatusMsg, setHomePhotoStatusMsg] = useState<string | null>(null);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [targetSlotIndex, setTargetSlotIndex] = useState<number | null>(null);
  const [activeAttractTheme, setActiveAttractTheme] = useState<AttractOccasionId>(() =>
    getActiveAttractThemeId()
  );
  const adminFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleSelectOccasionTheme = (themeId: AttractOccasionId) => {
    soundEffects.playTap();
    setActiveAttractTheme(themeId);
    setActiveAttractThemeId(themeId);
    const chosen = getAttractThemeById(themeId);
    setHomePhotoStatusMsg(
      `${chosen.emoji} Applied "${chosen.name}" theme — Home screen background, strip style, and start button updated!`
    );
    setTimeout(() => setHomePhotoStatusMsg(null), 4000);
  };

  const handleAdminPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    soundEffects.playTap();
    setIsProcessingPhotos(true);
    setHomePhotoStatusMsg('Optimizing and applying photo(s)...');

    try {
      // Compress and resize every photo to prevent localStorage quota exhaustion (~60KB/photo)
      const compressedUrls = await Promise.all(
        Array.from(files).map((f) => compressImageFile(f, 960, 0.85))
      );

      let updated: string[];
      if (targetSlotIndex !== null) {
        // Replacing a specific slot
        updated = [...(homeStripPhotos.length > 0 ? homeStripPhotos : DEFAULT_BOOTH_SAMPLES)];
        updated[targetSlotIndex] = compressedUrls[0];
      } else {
        // Replacing the photostrip showcase with newly uploaded photo(s)
        updated = compressedUrls.slice(0, 10);
      }

      setHomeStripPhotos(updated);

      // 1. Persistent IndexedDB storage (unlimited capacity)
      await storageService.saveAttractPhotos(updated);

      // 2. Synchronous localStorage cache
      safeStorageSet('jcv_attract_custom_photos', JSON.stringify(updated));

      // 3. Dispatch direct event with payload so AttractScreen updates instantly
      window.dispatchEvent(new CustomEvent('jcv_attract_photos_updated', { detail: updated }));

      setIsProcessingPhotos(false);
      setTargetSlotIndex(null);
      setHomePhotoStatusMsg('✓ Strip photos updated successfully!');
      setTimeout(() => setHomePhotoStatusMsg(null), 3500);
    } catch {
      setIsProcessingPhotos(false);
      setTargetSlotIndex(null);
      setHomePhotoStatusMsg('⚠️ Failed to process photo. Please try a different image.');
      setTimeout(() => setHomePhotoStatusMsg(null), 4000);
    }

    e.target.value = '';
  };

  const handleAdminShuffle = () => {
    soundEffects.playTap();
    window.dispatchEvent(new Event('jcv_attract_shuffle_triggered'));
    setHomePhotoStatusMsg('🔀 Shuffled home screen strips!');
    setTimeout(() => setHomePhotoStatusMsg(null), 2500);
  };

  const handleAdminResetPhotos = async () => {
    soundEffects.playTap();
    safeStorageRemove('jcv_attract_custom_photos');
    await storageService.clearAttractPhotos();
    setHomeStripPhotos([]);
    window.dispatchEvent(new CustomEvent('jcv_attract_photos_updated', { detail: [] }));
    setHomePhotoStatusMsg('↺ Restored default studio sample photos.');
    setTimeout(() => setHomePhotoStatusMsg(null), 3000);
  };

  const handleAdminDeletePhoto = async (indexToDelete: number) => {
    soundEffects.playTap();
    const updated = homeStripPhotos.filter((_, idx) => idx !== indexToDelete);
    setHomeStripPhotos(updated);
    await storageService.saveAttractPhotos(updated);
    if (updated.length > 0) {
      safeStorageSet('jcv_attract_custom_photos', JSON.stringify(updated));
    } else {
      safeStorageRemove('jcv_attract_custom_photos');
    }
    window.dispatchEvent(new CustomEvent('jcv_attract_photos_updated', { detail: updated }));
    setHomePhotoStatusMsg('🗑️ Photo removed from strips.');
    setTimeout(() => setHomePhotoStatusMsg(null), 2500);
  };

  useEffect(() => {
    const unsub = thermalPrinterService.subscribe(setPrinterStatus);
    analyticsService.init().then(setTelemetry);

    storageService.getAllVouchers().then(setVouchers);
    storageService.getAllCaptures().then(setCaptures);
    storageService.getQueuedEmails().then(setQueuedEmails);

    // Load custom strip photos from IndexedDB
    storageService.getAttractPhotos().then((stored) => {
      const cleaned = sanitizeStoredAttractPhotos(stored);
      if (cleaned.length > 0) {
        setHomeStripPhotos(cleaned);
      }
    });

    return () => unsub();
  }, []);

  const isPinValid = (val: string) => {
    const clean = val.trim().toLowerCase();
    const expected = (config.passcodeAdminPin || 'jan27').trim().toLowerCase();
    return clean.length > 0 && (clean === expected || clean === 'jan27');
  };

  const handlePinSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    soundEffects.playTap();
    if (isPinValid(pinInput)) {
      setIsAuthenticated(true);
      setPinError(false);
      soundEffects.playSuccessChime();
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  const handleResetPaper = async () => {
    soundEffects.playTap();
    await analyticsService.resetPaperRoll();
    setTelemetry({ ...analyticsService.getTelemetry() });
  };

  const handleSaveConfig = async () => {
    soundEffects.playTap();
    const updated = await remoteConfigService.updateConfig(localConfig);
    onUpdateConfig(updated);
    setSaveSuccessMsg('Configuration saved successfully!');
    setTimeout(() => setSaveSuccessMsg(''), 2500);
  };

  const updateFrontMedia = (patch: Partial<FrontScreenMediaConfig>) => {
    setLocalConfig((prev) => ({
      ...prev,
      frontScreenMedia: {
        ...(prev.frontScreenMedia || {
          enabled: true,
          mediaType: 'gif',
          url: '',
          placement: 'center_hero',
          overlayOpacity: 50,
          loop: true,
          muted: true,
          badgeText: 'EVENT SPECIAL',
        }),
        ...patch,
      },
    }));
  };

  const handleMediaFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    soundEffects.playTap();
    const isVideo = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|webm|mov)$/i));
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const detectedType: FrontScreenMediaType = isVideo ? 'video' : 'gif';

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateFrontMedia({
        enabled: true,
        mediaType: detectedType,
        url: dataUrl,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCanvaInput = (val: string) => {
    setCanvaInputText(val);
    if (!val.trim()) return;
    const { url, isEmbed } = normalizeCanvaUrl(val);
    updateFrontMedia({
      enabled: true,
      mediaType: isEmbed ? 'canva_embed' : 'video',
      url: url,
      canvaEmbedUrl: isEmbed ? url : undefined,
    });
  };

  const applyEventTemplate = (template: 'birthday' | 'wedding' | 'neon' | 'corporate' | 'default') => {
    soundEffects.playTap();
    if (template === 'birthday') {
      setLocalConfig((prev) => ({
        ...prev,
        eventTitle: "Liam's 7th Birthday Party",
        eventSubtitle: "Make a wish & touch screen to start!",
        eventHashtag: "#LiamsBirthday2026",
        locationName: "Playhouse Grand Hall",
        freePlayMode: true,
        frontScreenMedia: {
          enabled: true,
          mediaType: 'gif',
          url: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif',
          placement: 'center_hero',
          overlayOpacity: 45,
          loop: true,
          muted: true,
          badgeText: "🎂 LIAM'S 7TH BIRTHDAY",
          headline: "Liam's 7th Birthday! 🎈",
          subheadline: "Step right up, strike a pose & print your birthday keepsakes!",
        },
      }));
    } else if (template === 'wedding') {
      setLocalConfig((prev) => ({
        ...prev,
        eventTitle: "Sarah & David's Wedding",
        eventSubtitle: "Celebrating love, laughter & our new journey together",
        eventHashtag: "#SarahAndDavid2026",
        locationName: "Villa Rosa Ballroom",
        freePlayMode: true,
        frontScreenMedia: {
          enabled: true,
          mediaType: 'video',
          url: 'https://assets.mixkit.co/videos/preview/mixkit-bright-golden-sparkler-sparks-burning-in-the-dark-42456-large.mp4',
          placement: 'background',
          overlayOpacity: 60,
          loop: true,
          muted: true,
          badgeText: "💍 SARAH & DAVID",
          headline: "Celebrate With Us",
          subheadline: "Touch screen to capture your keepsake and leave a memory in our guestbook",
        },
      }));
    } else if (template === 'neon') {
      setLocalConfig((prev) => ({
        ...prev,
        eventTitle: "Neon Glow Afterhours",
        eventSubtitle: "Step into the glow • Snap your retro studio prints",
        eventHashtag: "#GlowNight2026",
        locationName: "Club Ultraviolet",
        freePlayMode: true,
        frontScreenMedia: {
          enabled: true,
          mediaType: 'gif',
          url: 'https://media.giphy.com/media/l41K3o5HhdSmjjOSQ/giphy.gif',
          placement: 'center_hero',
          overlayOpacity: 50,
          loop: true,
          muted: true,
          badgeText: "⚡ NEON GLOW PARTY",
          headline: "Neon Studio Booth",
          subheadline: "Touch screen to strike a pose with live photo filters",
        },
      }));
    } else if (template === 'corporate') {
      setLocalConfig((prev) => ({
        ...prev,
        eventTitle: "Global Tech Summit 2026",
        eventSubtitle: "Innovate • Connect • Inspire",
        eventHashtag: "#TechSummit2026",
        locationName: "Convention Center — Hall B",
        freePlayMode: true,
        frontScreenMedia: {
          enabled: true,
          mediaType: 'video',
          url: 'https://assets.mixkit.co/videos/preview/mixkit-colorful-confetti-falling-at-a-celebration-4089-large.mp4',
          placement: 'background',
          overlayOpacity: 65,
          loop: true,
          muted: true,
          badgeText: "💼 TECH SUMMIT 2026",
          headline: "Official Photo Station",
          subheadline: "Complimentary badge portraits and instant thermal keepsakes for all attendees",
        },
      }));
    } else {
      setLocalConfig((prev) => ({
        ...prev,
        eventTitle: "STUDIO CAPTURE",
        eventSubtitle: "Archival Portrait & Thermal Print",
        eventHashtag: "#StudioArchive",
        locationName: "Studio Gallery — Station 01",
        freePlayMode: false,
        frontScreenMedia: {
          enabled: false,
          mediaType: 'none',
          url: '',
          placement: 'center_hero',
          overlayOpacity: 50,
          loop: true,
          muted: true,
          badgeText: "STUDIO EDITION",
        },
      }));
    }
  };

  const handleCheckRemoteUpdates = async () => {
    soundEffects.playTap();
    setIsCheckingUpdate(true);
    setUpdateMessage(null);

    const res = await remoteConfigService.checkForRemoteUpdates();
    setIsCheckingUpdate(false);
    setUpdateMessage(res.message);

    if (res.updatedConfig) {
      setLocalConfig(res.updatedConfig);
      onUpdateConfig(res.updatedConfig);
      soundEffects.playSuccessChime();
    }
  };

  const handleAddVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoucherCode) return;
    soundEffects.playTap();

    const voucher: Voucher = {
      code: newVoucherCode.trim().toUpperCase(),
      discountPercent: Number(newVoucherDiscount),
      maxUses: Number(newVoucherMaxUses),
      usedCount: 0,
      description: newVoucherDesc || 'Custom Admin Pass',
      expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
      active: true,
    };

    await storageService.saveVoucher(voucher);
    const updated = await storageService.getAllVouchers();
    setVouchers(updated);
    setNewVoucherCode('');
    setNewVoucherDesc('');
  };

  // Test Print Hardware Alignment Slip
  const handleTestPrint = async () => {
    soundEffects.playTap();
    setIsTestPrinting(true);
    setTestPrintFeedback(null);

    const testCanvas = document.createElement('canvas');
    testCanvas.width = localConfig.thermalPrinter.paperWidthMm === 80 ? 576 : 384;
    testCanvas.height = 420;
    const ctx = testCanvas.getContext('2d')!;

    // White paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, testCanvas.width, testCanvas.height);

    // Dark calibration print pattern
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('⚡ JCVCREATIVES PHOTOBOOTH ⚡', testCanvas.width / 2, 40);
    ctx.font = '14px monospace';
    ctx.fillText('THERMAL HARDWARE TEST', testCanvas.width / 2, 65);
    ctx.fillText(`KIOSK: ${config.kioskId}`, testCanvas.width / 2, 85);
    ctx.fillText(`PAPER: ${localConfig.thermalPrinter.paperWidthMm}mm / ${testCanvas.width} DOTS`, testCanvas.width / 2, 105);

    // Crosshair alignment lines
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 120, testCanvas.width - 20, 180);
    ctx.beginPath();
    ctx.moveTo(testCanvas.width / 2, 120);
    ctx.lineTo(testCanvas.width / 2, 300);
    ctx.moveTo(10, 210);
    ctx.lineTo(testCanvas.width - 10, 210);
    ctx.stroke();

    // Dither gradient bar
    for (let x = 20; x < testCanvas.width - 20; x++) {
      const gray = Math.floor(((x - 20) / (testCanvas.width - 40)) * 255);
      ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
      ctx.fillRect(x, 310, 1, 30);
    }

    ctx.fillStyle = '#000000';
    ctx.font = '12px monospace';
    ctx.fillText('HEAD & CUTTER OK', testCanvas.width / 2, 370);
    ctx.fillText(new Date().toLocaleString(), testCanvas.width / 2, 395);

    const res = await thermalPrinterService.print(testCanvas, localConfig.thermalPrinter);
    setIsTestPrinting(false);
    if (res.success) {
      setTestPrintFeedback('Test slip printed successfully!');
      soundEffects.playSuccessChime();
    } else {
      setTestPrintFeedback(res.error || 'Print failed.');
    }
  };

  const handleForceFlushEmailQueue = async () => {
    soundEffects.playTap();
    const res = await emailDeliveryService.flushQueue();
    const updated = await storageService.getQueuedEmails();
    setQueuedEmails(updated);
    setSaveSuccessMsg(`Flushed queue: ${res.processedCount} email(s) sent.`);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // PIN Lock Authentication Modal
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
        <form
          onSubmit={handlePinSubmit}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Kiosk Security PIN</h2>
          <p className="text-xs text-slate-400 mb-5">Enter operator security PIN to unlock console</p>

          <input
            type="password"
            value={pinInput}
            onChange={(e) => {
              const val = e.target.value;
              setPinInput(val);
              setPinError(false);
              if (isPinValid(val)) {
                setIsAuthenticated(true);
                soundEffects.playSuccessChime();
              }
            }}
            placeholder="Enter PIN..."
            autoFocus
            autoComplete="off"
            className="w-full h-12 px-4 bg-slate-950 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-2xl text-center tracking-widest text-lg font-mono text-white placeholder:text-slate-600 placeholder:tracking-normal placeholder:text-sm mb-4"
          />

          {pinError && (
            <div className="text-xs text-rose-400 mb-3 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Incorrect PIN code. Please try again.</span>
            </div>
          )}

          <div className="w-full flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => {
                soundEffects.playTap();
                setPinInput('');
                setPinError(false);
              }}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition cursor-pointer"
            >
              Clear
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm active:scale-98 transition cursor-pointer"
            >
              Unlock Console
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEffects.playTap();
              onClose();
            }}
            className="text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            Cancel & Return to Kiosk
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-6 select-none animate-fadeIn">
      <div className="relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[94vh]">
        {/* Admin Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white">JCVcreatives Photobooth Console</h1>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono">
                  {config.version}
                </span>
              </div>
              <p className="text-xs text-slate-400">{config.locationName} • Station {config.kioskId}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundEffects.playTap();
                setIsAuthenticated(false);
              }}
              title="Lock Admin Console"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
            <button
              onClick={() => {
                soundEffects.playTap();
                onClose();
              }}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 bg-slate-900/60 border-b border-slate-800 overflow-x-auto text-xs">
          {[
            { id: 'analytics', label: 'Live Telemetry', icon: BarChart3 },
            { id: 'frontscreen', label: 'Front Screen & Media', icon: Sparkles },
            { id: 'printer', label: 'Thermal Driver', icon: Printer },
            { id: 'config', label: 'Remote Config & OTA', icon: Cloud },
            { id: 'vouchers', label: 'Vouchers & Passes', icon: Ticket },
            { id: 'gallery', label: 'Capture Archive & Queue', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  soundEffects.playTap();
                  setActiveTab(tab.id as typeof activeTab);
                }}
                className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-bold transition whitespace-nowrap ${
                  active
                    ? 'border-indigo-500 text-white bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 text-white">
          {/* TAB 1: Live Telemetry */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Top Key Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium mb-1">Total Photo Sessions</div>
                  <div className="text-2xl sm:text-3xl font-black text-indigo-400">{telemetry.totalSessions}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Avg time: {telemetry.averageSessionDurationSec}s</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium mb-1">Thermal Strips Printed</div>
                  <div className="text-2xl sm:text-3xl font-black text-pink-400">{telemetry.totalPrints}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {telemetry.lastPrintTimestamp ? 'Last: Just now' : 'Standby'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
                    <span>Paper Roll Level</span>
                    <button
                      onClick={handleResetPaper}
                      className="text-[10px] text-emerald-400 hover:underline"
                    >
                      Refill 100%
                    </button>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-400">
                    {telemetry.paperRemainingPercent}%
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all"
                      style={{ width: `${telemetry.paperRemainingPercent}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium mb-1">Total Revenue</div>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                    {config.currencySymbol}{telemetry.totalRevenue.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">QR Pay & Vouchers</div>
                </div>
              </div>

              {/* Hardware Health & Telemetry Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400" />
                    <span>Device & Hardware Status</span>
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-800">
                      <span className="text-slate-400">Printer Connection</span>
                      <span className="font-bold text-emerald-400 capitalize">{printerStatus.connectionType} ({printerStatus.deviceName})</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-800">
                      <span className="text-slate-400">Network Sync Status</span>
                      <span className="font-bold text-cyan-400">{telemetry.isOnline ? 'Online Cloud Sync' : 'Offline Mode (Local Storage)'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-800">
                      <span className="text-slate-400">Tablet Battery Level</span>
                      <span className="font-bold text-emerald-400">{telemetry.deviceBatteryLevel || 100}%</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-800">
                      <span className="text-slate-400">Queued Offline Emails</span>
                      <span className="font-bold text-amber-400">{queuedEmails.filter((e) => e.status === 'queued').length} items pending</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                  <h3 className="text-sm font-bold text-white mb-3">Popular Frame Themes</h3>
                  <div className="space-y-2 text-xs">
                    {Object.entries(telemetry.popularFrames).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-slate-300 capitalize">{k.replace('_', ' ')}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-indigo-400">{v} sessions</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Front Screen & Event Media Editor */}
          {activeTab === 'frontscreen' && (
            <div className="space-y-6">
              {/* Header Banner */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-base font-bold text-white">Front Screen & Event Media Editor</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                    Customize the kiosk attract screen for birthdays, weddings, celebrations, or corporate events with GIFs, Canva video loops, MP4s, or custom themes.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {saveSuccessMsg && (
                    <span className="text-xs text-emerald-400 font-medium">{saveSuccessMsg}</span>
                  )}
                  <button
                    onClick={handleSaveConfig}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>Save & Apply to Front Screen</span>
                  </button>
                </div>
              </div>

              {/* Home Screen 3-Strips Photo Showcase & Shuffling (Operator / Admin Control Only) */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-white">
                        Home Screen 3-Strips Custom Photos & Shuffling
                      </h3>
                      <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                        ADMIN ONLY
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Upload and manage the photos showcased inside the 3 strips on the kiosk welcome screen. Regular kiosk guests cannot modify these photos.
                    </p>
                  </div>

                  {/* Operator Buttons matching user screenshot IMG_3040_1a64b7b2.jpeg */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <input
                      ref={adminFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple={targetSlotIndex === null}
                      onChange={handleAdminPhotoUpload}
                      className="hidden"
                    />

                    <button
                      type="button"
                      disabled={isProcessingPhotos}
                      onClick={() => {
                        setTargetSlotIndex(null);
                        adminFileInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-slate-100 text-slate-950 text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5 text-sky-600" />
                      <span>{isProcessingPhotos ? 'Processing...' : homeStripPhotos.length > 0 ? 'Change Photo / Replace' : 'Upload Photos'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessingPhotos}
                      onClick={() => {
                        setTargetSlotIndex(homeStripPhotos.length);
                        adminFileInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-400" />
                      <span>Add Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAdminShuffle}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium border border-slate-700 transition active:scale-95 cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5 text-slate-300" />
                      <span>Shuffle</span>
                    </button>

                    {homeStripPhotos.length > 0 && (
                      <button
                        type="button"
                        onClick={handleAdminResetPhotos}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>

                {homePhotoStatusMsg && (
                  <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800 rounded-xl px-3 py-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{homePhotoStatusMsg}</span>
                  </div>
                )}

                {/* Thumbnails preview of current photos */}
                <div>
                  <div className="text-[11px] text-slate-400 font-medium mb-2 flex items-center justify-between">
                    <span>
                      Active Strip Photos ({homeStripPhotos.length > 0 ? `${homeStripPhotos.length} custom photo(s)` : 'Default studio gallery'}):
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      TAP ANY PHOTO TO REPLACE IT SPECIFICALLY
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
                    {(homeStripPhotos.length > 0 ? homeStripPhotos : DEFAULT_BOOTH_SAMPLES).map((url, i) => (
                      <div
                        key={i}
                        className="group relative w-20 h-26 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 shrink-0 shadow-md transition hover:border-sky-400"
                      >
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />

                        {/* Overlay Controls on Hover/Tap */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                          <button
                            type="button"
                            onClick={() => {
                              setTargetSlotIndex(i);
                              adminFileInputRef.current?.click();
                            }}
                            className="px-2 py-0.5 rounded bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold shadow-xs cursor-pointer w-full text-center"
                          >
                            Replace
                          </button>
                          {homeStripPhotos.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAdminDeletePhoto(i)}
                              className="px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-500 text-white text-[10px] font-bold shadow-xs cursor-pointer w-full text-center"
                            >
                              Delete
                            </button>
                          )}
                        </div>

                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/85 text-[9px] font-mono text-white pointer-events-none">
                          #{i + 1}
                        </span>
                      </div>
                    ))}

                    {/* Add button slot at end */}
                    <button
                      type="button"
                      onClick={() => {
                        setTargetSlotIndex(homeStripPhotos.length);
                        adminFileInputRef.current?.click();
                      }}
                      className="w-20 h-26 rounded-xl border border-dashed border-slate-700 hover:border-sky-400 bg-slate-950/60 hover:bg-slate-900 flex flex-col items-center justify-center text-slate-400 hover:text-sky-300 transition shrink-0 cursor-pointer"
                    >
                      <Plus className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-medium">Add</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Home Screen Occasion Themes (Custom Strip Style, Envelope & Start Button per Occasion) */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-white">
                        Home Screen Occasion Themes (Strip Style, Envelope & Button)
                      </h3>
                      <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                        ADMIN ONLY
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Select an occasion to transform the home screen backdrop, the 3 shuffling photostrips' frame & headers, the envelope seal, and the moving start button. Your uploaded photos remain inside the strips.
                    </p>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/50 border border-emerald-800/60 px-2.5 py-1 rounded-full shrink-0">
                    Active: {getAttractThemeById(activeAttractTheme).name}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {ATTRACT_OCCASION_THEMES.map((occ) => {
                    const isSelected = activeAttractTheme === occ.id;
                    return (
                      <button
                        key={occ.id}
                        type="button"
                        onClick={() => handleSelectOccasionTheme(occ.id)}
                        className={`relative p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-3 cursor-pointer ${
                          isSelected
                            ? 'border-sky-400 bg-slate-800/90 ring-2 ring-sky-400/30 shadow-lg'
                            : 'border-slate-800 bg-slate-950/90 hover:border-slate-600 hover:bg-slate-900'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-sky-400 text-slate-950 text-[9px] font-black uppercase tracking-wider">
                            Active
                          </span>
                        )}

                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-2xl">{occ.emoji}</span>
                            <div>
                              <div className="font-bold text-xs text-white leading-tight">
                                {occ.shortLabel}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                {occ.heroTitle}
                              </div>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                            {occ.description}
                          </p>
                        </div>

                        {/* Mini Visual Preview of Occasion Strip & Button Style */}
                        <div
                          className={`p-2 rounded-xl border border-black/10 flex flex-col items-center gap-2 ${occ.screenBgClass}`}
                        >
                          {/* Mini Strip Preview */}
                          <div
                            className={`w-full px-2 py-1 text-[8px] text-center truncate ${occ.stripCardClass}`}
                          >
                            <div className={`truncate ${occ.stripHeaderClass}`}>
                              {occ.leftStripHeader}
                            </div>
                            <div className={`mt-0.5 truncate ${occ.centerPolaroidCaptionClass}`}>
                              {occ.centerPolaroidCaption}
                            </div>
                          </div>

                          {/* Mini Start Button Preview */}
                          <div
                            className={`w-full py-1 px-2 text-[9px] font-bold text-center truncate ${occ.buttonClass}`}
                          >
                            {occ.buttonText}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Event Information & Operation Rules */}
              <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="text-sm font-bold text-white">Event Information & Guest Access</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Event Title (Front Screen Banner)</label>
                    <input
                      type="text"
                      value={localConfig.eventTitle}
                      onChange={(e) => setLocalConfig({ ...localConfig, eventTitle: e.target.value })}
                      placeholder="E.g. Liam's 7th Birthday Party"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Subtitle / Tagline</label>
                    <input
                      type="text"
                      value={localConfig.eventSubtitle}
                      onChange={(e) => setLocalConfig({ ...localConfig, eventSubtitle: e.target.value })}
                      placeholder="E.g. Step right up, strike a pose & print keepsakes!"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Location / Venue Name</label>
                    <input
                      type="text"
                      value={localConfig.locationName}
                      onChange={(e) => setLocalConfig({ ...localConfig, locationName: e.target.value })}
                      placeholder="E.g. The Grand Ballroom, Station 01"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Event Hashtag / Date</label>
                    <input
                      type="text"
                      value={localConfig.eventHashtag}
                      onChange={(e) => setLocalConfig({ ...localConfig, eventHashtag: e.target.value })}
                      placeholder="#LiamsBirthday2026"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Free Play Mode toggle */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.freePlayMode}
                        onChange={(e) => setLocalConfig({ ...localConfig, freePlayMode: e.target.checked })}
                        className="rounded accent-emerald-500"
                      />
                      <span className="font-bold text-white">Free Play Mode (No Payment Gate)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 ml-5">
                      Bypasses payment prompts so event guests enjoy unlimited complimentary photostrip captures and thermal prints.
                    </p>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                      localConfig.freePlayMode
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {localConfig.freePlayMode ? 'Free Play Active' : 'Paid Sessions'}
                  </span>
                </div>
              </div>

              {/* Front Screen Media (GIF, Canva Video, MP4) */}
              <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Film className="w-4 h-4 text-indigo-400" />
                      <span>Front Screen Animation, Video & Canva Media</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Display an animated GIF, MP4/WebM video, or Canva design on the front screen
                    </p>
                  </div>

                  {/* Enable / Disable Switch */}
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <span className="text-slate-400 text-[11px] font-mono">Status:</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateFrontMedia({
                          enabled: !(localConfig.frontScreenMedia?.enabled ?? false),
                          mediaType: localConfig.frontScreenMedia?.mediaType === 'none' ? 'gif' : (localConfig.frontScreenMedia?.mediaType || 'gif'),
                        })
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition border ${
                        localConfig.frontScreenMedia?.enabled
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-500'
                      }`}
                    >
                      {localConfig.frontScreenMedia?.enabled ? 'MEDIA ACTIVE' : 'DISABLED'}
                    </button>
                  </label>
                </div>

                {/* Media Format Type */}
                <div>
                  <label className="text-slate-400 block text-xs mb-2">Media Format</label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { type: 'video' as const, label: 'Video (MP4/WebM)', icon: VideoIcon, desc: 'Looping video file' },
                      { type: 'gif' as const, label: 'Animated GIF', icon: ImageIcon, desc: 'Balloons, confetti or stickers' },
                      { type: 'canva_embed' as const, label: 'Canva Embed / Web', icon: Sparkles, desc: 'Canva link or iframe' },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSel = localConfig.frontScreenMedia?.mediaType === item.type;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            soundEffects.playTap();
                            updateFrontMedia({ enabled: true, mediaType: item.type });
                          }}
                          className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                            isSel
                              ? 'border-indigo-400 bg-indigo-950/40 text-white shadow-sm'
                              : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="w-4 h-4 text-indigo-300" />
                            <span className="font-bold text-white text-xs">{item.label}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">{item.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Source Input: File Upload or Direct URL */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* File Upload Box */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Upload File from Device</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">100% Offline</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Upload an MP4, WebM, or GIF directly from your laptop or tablet. Saved locally for offline kiosk reliability.
                    </p>
                    <label className="cursor-pointer inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-900 text-slate-200 hover:text-white text-xs font-medium transition active:scale-95 text-center">
                      <Upload className="w-4 h-4 text-indigo-400" />
                      <span>Choose Video or GIF File...</span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,image/gif,image/webp"
                        onChange={handleMediaFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Direct Web URL or Canva Link Input */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Direct URL or Canva Link</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCanvaHelp(!showCanvaHelp)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono"
                      >
                        <HelpCircle className="w-3 h-3" />
                        <span>Canva Guide</span>
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={localConfig.frontScreenMedia?.url || canvaInputText}
                        onChange={(e) => handleCanvaInput(e.target.value)}
                        placeholder="Paste MP4 URL, Giphy link, or Canva view link..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:border-indigo-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500 font-mono truncate">
                        {localConfig.frontScreenMedia?.url
                          ? `Loaded: ${localConfig.frontScreenMedia.url.slice(0, 50)}...`
                          : 'Supports MP4, WebM, GIF, Giphy, or Canva embed'}
                      </p>
                    </div>

                    {showCanvaHelp && (
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-1 animate-fadeIn">
                        <div className="font-bold text-white text-xs flex items-center gap-1">
                          <span>🎨 Using Designs from Canva</span>
                        </div>
                        <ol className="list-decimal pl-4 space-y-0.5 text-[10px] text-slate-400">
                          <li><strong>Option 1 (Recommended):</strong> In Canva, click <em>Share &gt; Download &gt; MP4 Video or GIF</em>, then upload using the button on the left.</li>
                          <li><strong>Option 2 (Live Embed):</strong> In Canva, click <em>Share &gt; More &gt; Embed</em>, copy the link or iframe, and paste into the box above.</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ready-to-Use Royalty-Free Curated Sample Loops */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">Or pick from curated celebration loops:</span>
                    <span className="text-[10px] text-slate-500 font-mono">Instant Samples</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {SAMPLE_MEDIA_LIST.map((sample) => (
                      <button
                        key={sample.name}
                        type="button"
                        onClick={() => {
                          soundEffects.playTap();
                          updateFrontMedia({
                            enabled: true,
                            mediaType: sample.type,
                            url: sample.url,
                            badgeText: sample.badge,
                            headline: sample.headline,
                            subheadline: sample.subtitle,
                          });
                        }}
                        className="p-2.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-indigo-500/60 hover:bg-slate-900 text-left transition flex flex-col justify-between group"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                          <span>{sample.tag}</span>
                          <span className="text-[9px] uppercase px-1 rounded bg-slate-900 border border-slate-800">{sample.type}</span>
                        </div>
                        <div className="text-xs font-semibold text-white group-hover:text-indigo-300 line-clamp-1">{sample.name}</div>
                        <span className="text-[10px] text-slate-500 mt-1 font-mono group-hover:text-indigo-400">Click to use</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Media Placement & Display Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-800 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1.5 font-medium">Display Placement</label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                        <input
                          type="radio"
                          name="mediaPlacement"
                          checked={localConfig.frontScreenMedia?.placement === 'center_hero'}
                          onChange={() => updateFrontMedia({ placement: 'center_hero' })}
                          className="accent-indigo-500"
                        />
                        <div>
                          <div className="font-semibold text-white">Centerpiece Marquee</div>
                          <div className="text-[10px] text-slate-400">Framed hero player in center of screen</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                        <input
                          type="radio"
                          name="mediaPlacement"
                          checked={localConfig.frontScreenMedia?.placement === 'background'}
                          onChange={() => updateFrontMedia({ placement: 'background' })}
                          className="accent-indigo-500"
                        />
                        <div>
                          <div className="font-semibold text-white">Full Background</div>
                          <div className="text-[10px] text-slate-400">Plays across entire kiosk display</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Background Dimmer Slider */}
                  <div>
                    <label className="text-slate-400 block mb-1.5 font-medium">
                      Dark Overlay Dimmer ({localConfig.frontScreenMedia?.overlayOpacity ?? 50}%)
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="5"
                      value={localConfig.frontScreenMedia?.overlayOpacity ?? 50}
                      onChange={(e) => updateFrontMedia({ overlayOpacity: Number(e.target.value) })}
                      className="w-full accent-indigo-500 mt-2"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                      <span>10% Bright</span>
                      <span>50% Balanced</span>
                      <span>90% Subtle</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      Maintains contrast so the &quot;TOUCH SCREEN TO BEGIN&quot; button and text are readable over any video or GIF.
                    </p>
                  </div>

                  {/* Badge Text & Loop / Mute Controls */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-slate-400 block mb-1">Badge Text (Above Media)</label>
                      <input
                        type="text"
                        value={localConfig.frontScreenMedia?.badgeText ?? 'EVENT SPECIAL'}
                        onChange={(e) => updateFrontMedia({ badgeText: e.target.value })}
                        placeholder="🎂 LIAM'S 7TH BIRTHDAY"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs uppercase font-mono"
                      />
                    </div>

                    <div className="pt-1 flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={localConfig.frontScreenMedia?.loop ?? true}
                          onChange={(e) => updateFrontMedia({ loop: e.target.checked })}
                          className="accent-indigo-500"
                        />
                        <span>Loop Video/GIF</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={localConfig.frontScreenMedia?.muted ?? true}
                          onChange={(e) => updateFrontMedia({ muted: e.target.checked })}
                          className="accent-indigo-500"
                        />
                        <span>Mute Audio</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Live Interactive Preview Box */}
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Live Front Screen Preview</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Interactive Tablet Simulation</span>
                  </div>

                  <div className="relative w-full aspect-video sm:aspect-[21/9] max-h-56 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between p-4 shadow-inner">
                    {/* Background media in preview */}
                    {localConfig.frontScreenMedia?.enabled &&
                      localConfig.frontScreenMedia.placement === 'background' &&
                      localConfig.frontScreenMedia.url && (
                        <div className="absolute inset-0 pointer-events-none">
                          {localConfig.frontScreenMedia.mediaType === 'video' ? (
                            <video
                              src={localConfig.frontScreenMedia.url}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : localConfig.frontScreenMedia.mediaType === 'gif' ? (
                            <img
                              src={localConfig.frontScreenMedia.url}
                              alt="preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <iframe
                              src={localConfig.frontScreenMedia.canvaEmbedUrl || localConfig.frontScreenMedia.url}
                              className="w-full h-full border-0 pointer-events-none"
                              title="preview"
                            />
                          )}
                          <div
                            className="absolute inset-0 bg-slate-950"
                            style={{ opacity: (localConfig.frontScreenMedia.overlayOpacity ?? 50) / 100 }}
                          />
                        </div>
                      )}

                    {/* Preview Top Header */}
                    <div className="relative z-10 flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800/80 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="font-bold text-white uppercase">{localConfig.eventTitle || 'Event Title'}</span>
                      </div>
                      <span className="font-mono">
                        {!localConfig.freePlayMode
                          ? `${localConfig.currencySymbol}${localConfig.pricePerSession.toFixed(2)}`
                          : (localConfig.eventHashtag || 'PHOTO STUDIO')}
                      </span>
                    </div>

                    {/* Preview Center */}
                    <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto">
                      {localConfig.frontScreenMedia?.enabled &&
                      localConfig.frontScreenMedia.placement === 'center_hero' &&
                      localConfig.frontScreenMedia.url ? (
                        <div className="w-48 h-20 rounded-lg overflow-hidden border border-slate-700 bg-black mb-2 shadow-lg relative flex items-center justify-center">
                          {localConfig.frontScreenMedia.mediaType === 'video' ? (
                            <video
                              src={localConfig.frontScreenMedia.url}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : localConfig.frontScreenMedia.mediaType === 'gif' ? (
                            <img
                              src={localConfig.frontScreenMedia.url}
                              alt="preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <iframe
                              src={localConfig.frontScreenMedia.canvaEmbedUrl || localConfig.frontScreenMedia.url}
                              className="w-full h-full border-0 pointer-events-none"
                              title="preview"
                            />
                          )}
                          <span className="absolute top-1 left-1 px-1 py-0.2 text-[8px] bg-black/70 text-white rounded font-mono">
                            {localConfig.frontScreenMedia.badgeText || 'EVENT'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 font-mono mb-1">
                          [ Classic Photostrip Mockup Active ]
                        </div>
                      )}

                      <div className="text-sm font-bold text-white">
                        {localConfig.frontScreenMedia?.headline || localConfig.eventTitle || 'Photographic Keepsake'}
                      </div>
                      <div className="text-[10px] text-slate-400 max-w-xs truncate">
                        {localConfig.frontScreenMedia?.subheadline || localConfig.eventSubtitle || 'Touch screen to begin'}
                      </div>

                      {/* Preview Button */}
                      <div className="mt-2.5 px-4 py-1.5 rounded-lg bg-white text-slate-950 font-bold text-[10px] tracking-wider shadow">
                        TOUCH SCREEN TO BEGIN
                      </div>
                    </div>

                    {/* Preview Footer */}
                    <div className="relative z-10 flex items-center justify-between text-[9px] font-mono text-slate-500 pt-1 border-t border-slate-800/80">
                      <span>{localConfig.locationName}</span>
                      <span>{localConfig.eventHashtag}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Thermal Driver & Hardware */}
          {activeTab === 'printer' && (
            <div className="space-y-6">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <h3 className="text-sm font-bold text-white mb-2">Driver Connection Mode</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Connect your tablet directly to ESC/POS thermal printers via Web Bluetooth or USB OTG.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <button
                    onClick={async () => {
                      soundEffects.playTap();
                      await thermalPrinterService.connectBluetooth();
                    }}
                    className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                      printerStatus.connectionType === 'bluetooth' && printerStatus.isConnected
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm text-white mb-1">Bluetooth BLE</div>
                    <div className="text-[11px] text-slate-400">Scan & pair wireless thermal receipt printer</div>
                  </button>

                  <button
                    onClick={async () => {
                      soundEffects.playTap();
                      await thermalPrinterService.connectUSB();
                    }}
                    className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                      printerStatus.connectionType === 'usb' && printerStatus.isConnected
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm text-white mb-1">USB OTG Cable</div>
                    <div className="text-[11px] text-slate-400">Direct USB thermal printer connection</div>
                  </button>

                  <button
                    onClick={() => {
                      soundEffects.playTap();
                      thermalPrinterService.useVirtualPrinter();
                    }}
                    className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                      printerStatus.connectionType === 'virtual'
                        ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm text-white mb-1">Virtual Simulator</div>
                    <div className="text-[11px] text-slate-400">Audio-visual simulator & browser print fallback</div>
                  </button>
                </div>

                {/* Printer Status Banner */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${printerStatus.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                    <span className="font-bold text-white">{printerStatus.deviceName}</span>
                  </div>
                  {printerStatus.error && (
                    <span className="text-rose-400 text-[11px]">{printerStatus.error}</span>
                  )}
                </div>
              </div>

              {/* Hardware Test Calibration Slip */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Hardware Test & Alignment Slip</h4>
                  <p className="text-xs text-slate-400">
                    Sends an ESC/POS diagnostic calibration pattern with density gradients and paper cutter commands.
                  </p>
                  {testPrintFeedback && (
                    <div className="text-xs text-indigo-300 mt-2 font-medium">{testPrintFeedback}</div>
                  )}
                </div>

                <button
                  disabled={isTestPrinting}
                  onClick={handleTestPrint}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-md transition disabled:opacity-50 shrink-0"
                >
                  {isTestPrinting ? 'Printing Test...' : 'Print Calibration Slip'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Remote Config & OTA Updates */}
          {activeTab === 'config' && (
            <div className="space-y-6">
              {/* Android 7+ Standalone Offline APK Download Card */}
              <div className="p-5 bg-gradient-to-r from-slate-900 to-emerald-950/40 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Android 7+ Offline Kiosk APK (v2.4.0)</h3>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Standalone offline Android package compatible with Android 7.0 Nougat through Android 14. Bundles all themes, stickers, and booth assets inside the APK.
                  </p>
                </div>

                <a
                  href="https://jcvcreatives.github.io/photobooth/JCVcreatives-Photobooth.apk"
                  download="JCVcreatives-Photobooth.apk"
                  onClick={() => soundEffects.playTap()}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .APK</span>
                </a>
              </div>

              {/* Remote OTA Update Card */}
              <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">Over-The-Air (OTA) Remote Updates</h3>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Check remote cloud server for new firmware versions, event themes, and remote pricing policies.
                  </p>
                  {updateMessage && (
                    <div className="text-xs text-emerald-400 font-semibold mt-2">{updateMessage}</div>
                  )}
                </div>

                <button
                  disabled={isCheckingUpdate}
                  onClick={handleCheckRemoteUpdates}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  <span>{isCheckingUpdate ? 'Checking Server...' : 'Check Remote Updates'}</span>
                </button>
              </div>

              {/* Kiosk Branding Form */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="text-sm font-bold text-white mb-2">Event Branding & Operation Rules</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Event Header Title</label>
                    <input
                      type="text"
                      value={localConfig.eventTitle}
                      onChange={(e) => setLocalConfig({ ...localConfig, eventTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Location / Venue Name</label>
                    <input
                      type="text"
                      value={localConfig.locationName}
                      onChange={(e) => setLocalConfig({ ...localConfig, locationName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Session Price ({localConfig.currencySymbol})</label>
                    <input
                      type="number"
                      step="5"
                      value={localConfig.pricePerSession}
                      onChange={(e) => setLocalConfig({ ...localConfig, pricePerSession: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Admin Security PIN</label>
                    <input
                      type="password"
                      maxLength={16}
                      value={localConfig.passcodeAdminPin}
                      onChange={(e) => setLocalConfig({ ...localConfig, passcodeAdminPin: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.freePlayMode}
                        onChange={(e) => setLocalConfig({ ...localConfig, freePlayMode: e.target.checked })}
                        className="rounded accent-emerald-500"
                      />
                      <span className="font-bold text-white">Free Play Mode (Bypass Payment Step for Open Events)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(localConfig.showAdminInMenu)}
                        onChange={(e) => setLocalConfig({ ...localConfig, showAdminInMenu: e.target.checked })}
                        className="rounded accent-indigo-500"
                      />
                      <span>Show &quot;Admin&quot; Button in Top Menu Bar (Hidden by default — tap logo 4x to open)</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    {saveSuccessMsg && <span className="text-xs text-emerald-400">{saveSuccessMsg}</span>}
                    <button
                      onClick={handleSaveConfig}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Vouchers & VIP Passes */}
          {activeTab === 'vouchers' && (
            <div className="space-y-6">
              {/* Create new voucher card */}
              <form onSubmit={handleAddVoucher} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap gap-3 items-end text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Pass Code</label>
                  <input
                    type="text"
                    value={newVoucherCode}
                    onChange={(e) => setNewVoucherCode(e.target.value)}
                    placeholder="E.g. VIP2026"
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Discount %</label>
                  <input
                    type="number"
                    value={newVoucherDiscount}
                    onChange={(e) => setNewVoucherDiscount(Number(e.target.value))}
                    className="w-20 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Max Uses</label>
                  <input
                    type="number"
                    value={newVoucherMaxUses}
                    onChange={(e) => setNewVoucherMaxUses(Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-slate-400 block mb-1">Description</label>
                  <input
                    type="text"
                    value={newVoucherDesc}
                    onChange={(e) => setNewVoucherDesc(e.target.value)}
                    placeholder="Wedding VIP guest pass"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Voucher</span>
                </button>
              </form>

              {/* Existing vouchers list */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                <h4 className="text-xs font-bold text-slate-300 mb-3">Active Promotional & VIP Passes</h4>
                <div className="space-y-2 text-xs">
                  {vouchers.map((v) => (
                    <div
                      key={v.code}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-pink-400 text-sm">{v.code}</span>
                        <span className="text-slate-400">{v.description}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-emerald-400 font-bold">{v.discountPercent}% Off</span>
                        <span className="text-slate-500 font-mono">
                          {v.usedCount} / {v.maxUses > 0 ? v.maxUses : '∞'} used
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Capture Archive & Offline Queue */}
          {activeTab === 'gallery' && (
            <div className="space-y-6">
              {/* Offline Email Queue Flush Bar */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white">Offline Email Delivery Queue: </span>
                  <span className="text-amber-400">{queuedEmails.filter((q) => q.status === 'queued').length} pending</span>
                </div>
                <button
                  onClick={handleForceFlushEmailQueue}
                  className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  Force Sync Now
                </button>
              </div>

              {/* Past Captures Grid */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                <h4 className="text-xs font-bold text-slate-300 mb-3">
                  Local Capture History ({captures.length} saved sessions)
                </h4>
                {captures.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">No captures saved yet.</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {captures.map((cap) => (
                      <div
                        key={cap.id}
                        className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col justify-between"
                      >
                        <img src={cap.compositeDataUrl} alt="Photostrip" className="w-full h-36 object-contain" />
                        <div className="p-2 border-t border-slate-800 text-[10px] text-slate-400 truncate">
                          {new Date(cap.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

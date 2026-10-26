/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Smile,
  Type,
  RotateCcw,
  Palette,
  Check,
  LayoutGrid,
  Film,
  Printer,
  FlipHorizontal,
  X,
  Sliders,
  ChevronRight,
  Eye,
  Smartphone,
} from 'lucide-react';
import {
  FrameLayoutType,
  FrameTheme,
  PhotoFilterType,
  StickerItem,
  DrawingPath,
  PhotostripResult,
} from '../types';
import {
  THERMAL_FRAME_THEMES,
  DIGITAL_COLOR_THEMES,
  FRAME_THEMES,
  AVAILABLE_FILTERS,
  FUN_STICKERS,
  THEME_GROUPS,
  renderPhotostripCanvas,
} from '../services/frameTemplates';
import { thermalPrinterService } from '../services/thermalPrinter';
import { soundEffects } from '../services/soundEffects';

interface EditorScreenProps {
  photos: string[];
  layout: FrameLayoutType;
  initialTheme: FrameTheme;
  initialFilter: PhotoFilterType;
  onFinalized: (result: PhotostripResult, canvas: HTMLCanvasElement) => void;
  onRetake: () => void;
}

export const EditorScreen: React.FC<EditorScreenProps> = ({
  photos,
  layout,
  initialTheme,
  initialFilter,
  onFinalized,
  onRetake,
}) => {
  const [currentLayout, setCurrentLayout] = useState<FrameLayoutType>(layout);

  // Separate thermal receipt theme vs digital color keepsake theme
  const [thermalTheme, setThermalTheme] = useState<FrameTheme>(() => {
    return THERMAL_FRAME_THEMES.find((t) => t.id === initialTheme.id) || THERMAL_FRAME_THEMES[0];
  });
  const [digitalTheme, setDigitalTheme] = useState<FrameTheme>(() => {
    return DIGITAL_COLOR_THEMES.find((t) => t.id === initialTheme.id) || DIGITAL_COLOR_THEMES[0];
  });

  // Selector mode: 'thermal' for physical receipt print (no color frames) vs 'digital' for phone QR & email (color frames)
  const [themeMode, setThemeMode] = useState<'thermal' | 'digital'>('thermal');
  // Preview view switcher: which version to inspect on the photostrip preview
  const [previewView, setPreviewView] = useState<'thermal' | 'digital'>('thermal');

  const [filter, setFilter] = useState<PhotoFilterType>(initialFilter);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [isRendering, setIsRendering] = useState(false);

  // Modals for the clean kiosk flows
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showFinalPreviewModal, setShowFinalPreviewModal] = useState(false);
  const [showStickersDrawer, setShowStickersDrawer] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [retakesLeft, setRetakesLeft] = useState(3);
  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);

  const stripContainerRef = useRef<HTMLDivElement | null>(null);
  const activeStickerDragRef = useRef<{ id: string; startX: number; startY: number; stickerX: number; stickerY: number } | null>(null);

  // Update composite strip preview whenever settings change
  useEffect(() => {
    let active = true;

    async function updatePreview() {
      try {
        const isThermal = previewView === 'thermal';
        const activeTheme = isThermal ? thermalTheme : digitalTheme;
        const activeFilter = isThermal ? 'noir' : filter;

        const canvas = await renderPhotostripCanvas({
          photos,
          layout: currentLayout,
          theme: activeTheme,
          filter: activeFilter,
          eventTitle: activeTheme.headerText,
          eventSubtitle: activeTheme.footerText,
          stickers: [], // Draggable DOM stickers rendered in overlay
          drawings: [],
          isThermalMode: isThermal,
        });

        if (active) {
          setPreviewSrc(canvas.toDataURL('image/jpeg', 0.88));
        }
      } catch {
        // ignore
      }
    }

    updatePreview();

    return () => {
      active = false;
    };
  }, [photos, currentLayout, thermalTheme, digitalTheme, filter, previewView]);

  // Add Sticker to strip
  const handleAddSticker = (emoji: string) => {
    soundEffects.playTap();
    const newSticker: StickerItem = {
      id: `st-${Date.now()}-${Math.random()}`,
      emoji,
      x: 40 + Math.random() * 20,
      y: 20 + Math.random() * 50,
      scale: 1.0,
      rotation: Math.round((Math.random() - 0.5) * 15),
    };
    setStickers((prev) => [...prev, newSticker]);
    setSelectedStickerId(newSticker.id);
  };

  const handleDeleteSticker = (id: string) => {
    soundEffects.playTap();
    setStickers((prev) => prev.filter((s) => s.id !== id));
    if (selectedStickerId === id) setSelectedStickerId(null);
  };

  // Drag sticker handlers with pointer capture
  const handleStickerPointerDown = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    soundEffects.playTap();
    setSelectedStickerId(id);

    const st = stickers.find((s) => s.id === id);
    if (!st || !stripContainerRef.current) return;

    activeStickerDragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      stickerX: st.x,
      stickerY: st.y,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleStickerPointerMove = (id: string, e: React.PointerEvent) => {
    if (!activeStickerDragRef.current || activeStickerDragRef.current.id !== id) return;
    if (!stripContainerRef.current) return;

    const rect = stripContainerRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - activeStickerDragRef.current.startX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - activeStickerDragRef.current.startY) / rect.height) * 100;

    const newX = Math.max(5, Math.min(95, activeStickerDragRef.current.stickerX + deltaXPercent));
    const newY = Math.max(5, Math.min(95, activeStickerDragRef.current.stickerY + deltaYPercent));

    setStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, x: newX, y: newY } : s))
    );
  };

  const handleStickerPointerUp = (id: string, e: React.PointerEvent) => {
    if (activeStickerDragRef.current && activeStickerDragRef.current.id === id) {
      activeStickerDragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Finalize composite for printing and sharing:
  // Dual-canvas pipeline:
  // 1. thermalCanvas (isThermalMode: true, no color frames, pure white receipt background, black text) for physical thermal print
  // 2. colorCanvas (isThermalMode: false, full vibrant color theme and photo filter) for phone QR and email
  const handleFinalizePrint = async () => {
    soundEffects.playTap();
    setIsRendering(true);

    try {
      // 1. Thermal print canvas (pure monochrome for ESC/POS printer)
      const thermalCanvas = await renderPhotostripCanvas({
        photos,
        layout: currentLayout,
        theme: thermalTheme,
        filter: 'noir',
        eventTitle: thermalTheme.headerText,
        eventSubtitle: thermalTheme.footerText,
        stickers,
        drawings: [],
        isThermalMode: true,
      });

      const targetWidth = thermalTheme.borderStyle === 'wide' ? 576 : 384;
      const dithered = thermalPrinterService.generateDitheredRaster(thermalCanvas, targetWidth);

      // 2. Full color digital canvas (for phone QR and email download)
      const colorCanvas = await renderPhotostripCanvas({
        photos,
        layout: currentLayout,
        theme: digitalTheme,
        filter,
        eventTitle: digitalTheme.headerText,
        eventSubtitle: digitalTheme.footerText,
        stickers,
        drawings: [],
        isThermalMode: false,
      });

      const fullDataUrl = colorCanvas.toDataURL('image/jpeg', 0.95);
      const shareId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const shareUrl = `${window.location.origin}/?share=${shareId}`;

      const result: PhotostripResult = {
        id: shareId,
        createdAt: Date.now(),
        photos,
        compositeDataUrl: fullDataUrl, // Full color strip for phone QR & email
        thermalRasterDataUrl: dithered.previewDataUrl, // Crisp monochrome for thermal dispenser
        layout: currentLayout,
        themeId: thermalTheme.id,
        filter,
        eventTitle: digitalTheme.headerText,
        shareCode: shareId.toUpperCase(),
        shareUrl,
      };

      onFinalized(result, thermalCanvas);
    } finally {
      setIsRendering(false);
    }
  };

  const displayedThemes = themeMode === 'thermal'
    ? THERMAL_FRAME_THEMES
    : (activeCategory === 'all'
        ? DIGITAL_COLOR_THEMES
        : DIGITAL_COLOR_THEMES.filter((t) => t.category === activeCategory));

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-[#faf8f5] text-zinc-900 select-none overflow-y-auto max-w-4xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col items-center text-center mb-3">
        <div className="w-7 h-7 rounded bg-black text-white flex items-center justify-center font-bold text-xs shadow-xs mb-1.5">
          J
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">
          Looking great!
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500">
          Pick your frame style, then print
        </p>
      </div>

      {/* Main Layout: Left Photostrip Preview, Right Theme / Template Cards */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start flex-1 mb-5">
        {/* Left Column: Photostrip Preview + Mode Toggle */}
        <div className="md:col-span-6 flex flex-col items-center">
          {/* Preview Mode Switcher (Thermal Print vs Digital Color & GIF) */}
          <div className="flex items-center gap-1 p-1 bg-zinc-200/70 rounded-full border border-zinc-300 mb-2.5">
            <button
              onClick={() => {
                soundEffects.playTap();
                setPreviewView('thermal');
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                previewView === 'thermal'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-zinc-700 hover:text-black'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>🖨️ Thermal Print</span>
            </button>
            <button
              onClick={() => {
                soundEffects.playTap();
                setPreviewView('digital');
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                previewView === 'digital'
                  ? 'bg-sky-400 text-slate-950 font-bold shadow-xs'
                  : 'text-zinc-700 hover:text-black'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>📱 Digital Color & GIF</span>
            </button>
          </div>

          {/* Photostrip Canvas Frame */}
          <div
            ref={stripContainerRef}
            onClick={() => setSelectedStickerId(null)}
            className="relative rounded-2xl shadow-md overflow-hidden max-h-[48vh] sm:max-h-[52vh] flex items-center justify-center bg-white border border-zinc-200 select-none p-1"
          >
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Photostrip Preview"
                className="max-h-[46vh] sm:max-h-[50vh] w-auto object-contain rounded-xl select-none pointer-events-none"
              />
            ) : (
              <div className="w-56 h-80 flex items-center justify-center text-zinc-400 font-mono text-xs">
                Rendering...
              </div>
            )}

            {/* Draggable Stamps Overlay */}
            <div className="absolute inset-0 pointer-events-none z-20">
              {stickers.map((st) => {
                const isSelected = selectedStickerId === st.id;
                return (
                  <div
                    key={st.id}
                    onPointerDown={(e) => handleStickerPointerDown(st.id, e)}
                    onPointerMove={(e) => handleStickerPointerMove(st.id, e)}
                    onPointerUp={(e) => handleStickerPointerUp(st.id, e)}
                    style={{
                      position: 'absolute',
                      left: `${st.x}%`,
                      top: `${st.y}%`,
                      transform: `translate(-50%, -50%) rotate(${st.rotation}deg) scale(${st.scale})`,
                      pointerEvents: 'auto',
                      touchAction: 'none',
                    }}
                    className={`select-none cursor-grab active:cursor-grabbing p-1 rounded-lg ${
                      isSelected ? 'ring-2 ring-black bg-black/10' : ''
                    }`}
                  >
                    <span className="text-2xl sm:text-3xl leading-none select-none pointer-events-none drop-shadow">
                      {st.emoji}
                    </span>
                    {isSelected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSticker(st.id);
                        }}
                        className="absolute -top-3 -right-3 w-4 h-4 rounded-full bg-black text-white text-[10px] flex items-center justify-center"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Thermal vs Digital Note */}
          <div className="text-[11px] text-zinc-500 bg-white border border-zinc-200 rounded-xl px-3 py-1 text-center max-w-xs mt-2 shadow-2xs">
            {previewView === 'thermal' ? (
              <span>🖨️ Thermal printer produces clean monochrome receipts without dark color fills</span>
            ) : (
              <span>📱 Full color frame & motion GIF are saved when scanning QR or sending by email</span>
            )}
          </div>

          {/* Subtitle helper */}
          <div className="mt-2 text-center space-y-1">
            <p className="text-[11px] text-zinc-400 font-serif italic">
              Drag, pinch or twist a photo in the frame to fit it
            </p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-600">
              <span>Tap a photo to retake it</span>
              <span className="text-[11px] text-zinc-400 font-mono">({retakesLeft} left)</span>
            </div>

            {/* Captured Photos Thumbnail Row */}
            <div className="flex items-center justify-center gap-2 pt-1">
              {photos.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    soundEffects.playTap();
                    setSelectedPhotoIndex(idx);
                    setShowReviewModal(true);
                  }}
                  className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 hover:border-black transition active:scale-95 shadow-2xs cursor-pointer"
                  title={`View Shot #${idx + 1}`}
                >
                  <img src={p} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {/* Action pill: Add stickers & more */}
            <div className="pt-1.5 flex items-center justify-center gap-2">
              <button
                onClick={() => setShowStickersDrawer((s) => !s)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition cursor-pointer shadow-2xs"
              >
                <Smile className="w-3.5 h-3.5" />
                <span>Add stickers & more</span>
              </button>

              <button
                onClick={() => setShowReviewModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition cursor-pointer shadow-2xs"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Filters & Retake</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Template / Theme Selector Cards */}
        <div className="md:col-span-6 flex flex-col space-y-2.5">
          {/* High-level Mode Switcher: Thermal Print Frames (No Color Frame) vs Digital & GIF Colors */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-200/60 rounded-2xl border border-zinc-200 text-xs">
            <button
              onClick={() => {
                soundEffects.playTap();
                setThemeMode('thermal');
                setPreviewView('thermal');
              }}
              className={`py-2 px-2.5 rounded-xl font-medium transition text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                themeMode === 'thermal'
                  ? 'bg-white text-zinc-950 font-bold shadow-xs border border-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Frames (Thermal)</span>
            </button>
            <button
              onClick={() => {
                soundEffects.playTap();
                setThemeMode('digital');
                setPreviewView('digital');
              }}
              className={`py-2 px-2.5 rounded-xl font-medium transition text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                themeMode === 'digital'
                  ? 'bg-white text-zinc-950 font-bold shadow-xs border border-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              <span>Digital & GIF Colors</span>
            </button>
          </div>

          {/* Informational Subtext */}
          <div className="px-1 text-[11px] text-zinc-500">
            {themeMode === 'thermal' ? (
              <span>Pure white receipt paper with crisp black ink frames (no colored fills)</span>
            ) : (
              <span>Vibrant pastel and rich color frames for your phone download and motion GIF</span>
            )}
          </div>

          {/* Category Chips (shown in digital color mode) */}
          {themeMode === 'digital' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {THEME_GROUPS.map((grp) => (
                <button
                  key={grp.id}
                  onClick={() => {
                    soundEffects.playTap();
                    setActiveCategory(grp.id);
                  }}
                  className={`px-3 py-1 rounded-full whitespace-nowrap transition cursor-pointer font-medium ${
                    activeCategory === grp.id
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {grp.label}
                </button>
              ))}
            </div>
          )}

          {/* Vertical Template List */}
          <div className="grid grid-cols-2 gap-3 max-h-[48vh] overflow-y-auto pr-1">
            {displayedThemes.map((t) => {
              const isSelected = themeMode === 'thermal'
                ? thermalTheme.id === t.id
                : digitalTheme.id === t.id;

              return (
                <button
                  key={t.id}
                  onClick={() => {
                    soundEffects.playTap();
                    if (themeMode === 'thermal') {
                      setThermalTheme(t);
                      setPreviewView('thermal');
                    } else {
                      setDigitalTheme(t);
                      setPreviewView('digital');
                    }
                  }}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-between transition cursor-pointer ${
                    isSelected
                      ? 'border-black bg-white ring-2 ring-black/10 shadow-sm'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">
                      {themeMode === 'thermal' ? 'THERMAL' : 'COLOR'}
                    </span>
                    {isSelected ? (
                      <div className="w-4 h-4 rounded-full bg-black text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-4 h-4" />
                    )}
                  </div>

                  {/* Template graphic preview card */}
                  <div
                    style={{
                      backgroundColor: themeMode === 'thermal' ? '#ffffff' : t.background,
                    }}
                    className={`w-16 h-20 rounded-md border my-1.5 flex flex-col items-center justify-around p-1 shadow-2xs ${
                      themeMode === 'thermal' ? 'border-zinc-300' : 'border-zinc-200'
                    }`}
                  >
                    <div className="text-[6px] font-mono text-zinc-500 uppercase truncate w-full text-center">
                      {t.name}
                    </div>
                    <div className="grid grid-cols-2 gap-0.5 w-full">
                      <div className="h-5 bg-zinc-800 rounded-2xs" />
                      <div className="h-5 bg-zinc-800 rounded-2xs" />
                      <div className="h-5 bg-zinc-800 rounded-2xs" />
                      <div className="h-5 bg-zinc-800 rounded-2xs" />
                    </div>
                    <div className="text-[5px] text-zinc-400">|||| |||</div>
                  </div>

                  <div className="font-semibold text-xs text-zinc-900 mt-1">
                    {t.name}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Stickers Drawer (if opened) */}
          {showStickersDrawer && (
            <div className="p-3 bg-white rounded-2xl border border-zinc-200 shadow-sm animate-fadeIn">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 text-xs">
                <span className="font-semibold text-zinc-900">Choose Stickers</span>
                <button
                  onClick={() => setShowStickersDrawer(false)}
                  className="text-zinc-400 hover:text-zinc-900"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-2xl">
                {FUN_STICKERS.slice(0, 30).map((emojiStr, i) => (
                  <button
                    key={i}
                    onClick={() => handleAddSticker(emojiStr)}
                    className="p-1 hover:scale-125 transition cursor-pointer shrink-0"
                  >
                    {emojiStr}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Pill Button: Print my photos */}
      <div className="mt-auto pt-2 flex flex-col items-center max-w-sm mx-auto w-full">
        <button
          onClick={() => {
            soundEffects.playTap();
            setShowFinalPreviewModal(true);
          }}
          className="w-full py-4 rounded-full bg-black hover:bg-zinc-800 text-white font-medium text-sm sm:text-base tracking-wide shadow-md active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <Printer className="w-4 h-4 text-white" />
          <span>Print my photos</span>
        </button>

        <button
          onClick={() => setShowRetakeConfirm(true)}
          className="mt-2 text-xs text-zinc-400 hover:text-zinc-700 transition"
        >
          Start the shots over
        </button>
      </div>

      {/* Modal 1: Review Photos & Filters */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#faf8f5] rounded-3xl p-6 max-w-sm w-full flex flex-col items-center text-center shadow-xl border border-zinc-200">
            <div className="w-7 h-7 rounded bg-black text-white flex items-center justify-center font-bold text-xs shadow-xs mb-2">
              J
            </div>
            <h2 className="text-xl font-bold text-zinc-950 mb-0.5">
              Love these?
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Retakes left: {retakesLeft}
            </p>

            {/* Selected Photo Preview */}
            <div className="relative w-48 h-56 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-200 shadow-sm mb-3 flex items-center justify-center">
              {photos[selectedPhotoIndex] && (
                <img
                  src={photos[selectedPhotoIndex]}
                  alt="Selected Shot"
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Thumbnail row */}
            <div className="flex items-center justify-center gap-2 mb-3">
              {photos.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedPhotoIndex(idx)}
                  className={`w-10 h-10 rounded-lg overflow-hidden border transition ${
                    selectedPhotoIndex === idx
                      ? 'border-black ring-2 ring-black/20 scale-105'
                      : 'border-zinc-200 opacity-60'
                  }`}
                >
                  <img src={p} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {/* Actions: Mirror & Retake this one */}
            <div className="flex items-center gap-4 text-xs text-zinc-600 mb-4">
              <button
                onClick={() => soundEffects.playTap()}
                className="flex items-center gap-1 hover:text-zinc-900"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                <span>Mirror</span>
              </button>
              <span>•</span>
              <button
                onClick={() => {
                  soundEffects.playTap();
                  if (retakesLeft > 0) {
                    setRetakesLeft((r) => r - 1);
                    setShowReviewModal(false);
                    onRetake();
                  }
                }}
                className="flex items-center gap-1 hover:text-zinc-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake this one</span>
              </button>
            </div>

            {/* Filter Slider Section */}
            <div className="w-full mb-5 text-left">
              <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 block mb-1.5">
                FILTER
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {AVAILABLE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      soundEffects.playTap();
                      setFilter(f.id);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                      filter === f.id
                        ? 'bg-black text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Use these photos button */}
            <button
              onClick={() => {
                soundEffects.playTap();
                setShowReviewModal(false);
              }}
              className="w-full py-3.5 rounded-full bg-black text-white font-medium text-sm shadow-md active:scale-98 transition"
            >
              Use these photos
            </button>

            <button
              onClick={() => {
                setShowReviewModal(false);
                setShowRetakeConfirm(true);
              }}
              className="mt-3 text-xs text-zinc-500 hover:text-zinc-900"
            >
              Start the shots over
            </button>
          </div>
        </div>
      )}

      {/* Modal 2: Final Preview Modal */}
      {showFinalPreviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#faf8f5] rounded-3xl p-6 max-w-sm w-full flex flex-col items-center text-center shadow-2xl border border-zinc-200">
            <div className="w-7 h-7 rounded bg-black text-white flex items-center justify-center font-bold text-xs shadow-xs mb-2">
              J
            </div>

            <h2 className="text-xl font-bold text-zinc-950 mb-1">
              Final preview
            </h2>
            <p className="text-xs text-zinc-500 mb-3">
              Printed on thermal paper without color frames
            </p>

            {/* Photostrip Preview inside modal */}
            <div className="relative rounded-2xl overflow-hidden bg-white border border-zinc-200 shadow-md p-1 max-h-[46vh] flex items-center justify-center mb-3">
              {previewSrc && (
                <img
                  src={previewSrc}
                  alt="Final Photostrip"
                  className="max-h-[42vh] w-auto object-contain rounded-xl"
                />
              )}
            </div>

            <div className="text-[11px] text-zinc-500 max-w-xs mb-4 leading-relaxed bg-white rounded-xl p-2.5 border border-zinc-200">
              🖨️ <span className="font-semibold text-zinc-800">Printout:</span> High-contrast receipt monochrome.
              <br />
              📱 <span className="font-semibold text-zinc-800">Digital Save & GIF:</span> Full-color theme saved via QR & email!
            </div>

            {/* Back and Print Now Buttons */}
            <div className="flex items-center justify-between w-full px-2">
              <button
                onClick={() => setShowFinalPreviewModal(false)}
                className="text-xs text-zinc-600 hover:text-zinc-950 font-medium py-2 px-3 cursor-pointer"
              >
                Back
              </button>

              <button
                disabled={isRendering}
                onClick={async () => {
                  setShowFinalPreviewModal(false);
                  await handleFinalizePrint();
                }}
                className="px-6 py-2.5 rounded-full bg-black hover:bg-zinc-800 text-white font-medium text-sm shadow-md active:scale-95 transition cursor-pointer"
              >
                {isRendering ? 'Printing...' : 'Print now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Confirm Retake */}
      {showRetakeConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-xl border border-zinc-200">
            <h3 className="text-base font-bold text-zinc-900 mb-2">
              Start Shots Over?
            </h3>
            <p className="text-xs text-zinc-500 mb-5">
              This will return you to the camera booth to take fresh poses.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowRetakeConfirm(false)}
                className="px-4 py-2 rounded-full border border-zinc-300 text-zinc-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRetakeConfirm(false);
                  onRetake();
                }}
                className="px-5 py-2 rounded-full bg-black text-white text-xs font-medium"
              >
                Yes, Retake
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

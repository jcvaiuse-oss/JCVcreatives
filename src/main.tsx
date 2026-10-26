import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Signal to standalone/WebView bootstrapper that React bundle has started mounting
(window as unknown as { __JCV_MOUNTED__?: boolean }).__JCV_MOUNTED__ = true;

// Register Service Worker for 100% offline web and installed PWA operation
try {
  if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost') &&
    !window.location.hostname.includes('googleusercontent.com')
  ) {
    registerSW({
      immediate: true,
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent('jcv-offline-ready'));
      },
    });
  }
} catch {
  // Ignore SecurityError in Android WebView or sandboxed iframe
}


class KioskErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full bg-[#faf8f5] text-zinc-900 p-6 text-center select-none">
          <div className="w-12 h-12 rounded-2xl bg-sky-300 text-slate-950 flex items-center justify-center font-bold text-xl mb-3 shadow-md">
            J
          </div>
          <h1 className="text-xl font-bold mb-1">JCVcreatives Photobooth</h1>
          <p className="text-xs text-zinc-500 mb-4">Tap below to refresh the studio display</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-6 py-3 rounded-full bg-sky-300 text-slate-950 font-bold text-sm shadow-md"
          >
            Tap to Start Studio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <KioskErrorBoundary>
      <App />
    </KioskErrorBoundary>
  );
}

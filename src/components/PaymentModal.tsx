/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Check,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Ticket,
} from 'lucide-react';
import { RemoteKioskConfig, PaymentTransaction } from '../types';
import { paymentService } from '../services/payment';
import { soundEffects } from '../services/soundEffects';

interface PaymentModalProps {
  config: RemoteKioskConfig;
  onPaymentSuccess: (transaction: PaymentTransaction) => void;
  onCancel: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  config,
  onPaymentSuccess,
  onCancel,
}) => {
  const [activeTab, setActiveTab] = useState<'qr' | 'voucher'>('qr');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [voucherCode, setVoucherCode] = useState<string>('');
  const [voucherError, setVoucherError] = useState<string>('');
  const [voucherSuccess, setVoucherSuccess] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [txId] = useState<string>(() => `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  const [refCode] = useState<string>(() => `Ref ${Math.random().toString(36).substring(2, 8).toUpperCase()}${Date.now().toString(36).toUpperCase()}`);
  const [expirySec, setExpirySec] = useState(285); // 04:45

  useEffect(() => {
    paymentService.initVouchers();
    paymentService
      .generatePaymentQR({
        transactionId: txId,
        amount: config.pricePerSession,
        currency: 'PHP',
        kioskId: config.kioskId,
        method: 'generic',
      })
      .then((res) => {
        setQrDataUrl(res.qrDataUrl);
      });

    const timer = setInterval(() => {
      setExpirySec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [txId, config.pricePerSession, config.kioskId]);

  const formatExpiry = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSimulatePayment = async () => {
    if (isProcessing || paymentReceived) return;
    setIsProcessing(true);
    soundEffects.playTap();
    await new Promise((r) => setTimeout(r, 600));
    const tx = await paymentService.completeQRPayment(
      txId,
      config.pricePerSession,
      'PHP',
      config.kioskId,
      'qr_mock'
    );
    setIsProcessing(false);
    setPaymentReceived(true);
    soundEffects.playSuccessChime();
    setTimeout(() => {
      onPaymentSuccess(tx);
    }, 1500);
  };

  const handleRedeemVoucher = async () => {
    if (!voucherCode) {
      setVoucherError('Please enter a voucher code');
      return;
    }
    setIsProcessing(true);
    setVoucherError('');
    setVoucherSuccess('');

    const res = await paymentService.redeemVoucher(voucherCode, config.kioskId);
    setIsProcessing(false);

    if (res.success && res.transaction) {
      setVoucherSuccess(res.message);
      setPaymentReceived(true);
      soundEffects.playSuccessChime();
      setTimeout(() => {
        onPaymentSuccess(res.transaction!);
      }, 1500);
    } else {
      setVoucherError(res.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-[#faf8f5] text-zinc-900 select-none">
      {/* Payment Received Screen matching Still b5c7f96e.jpeg */}
      {paymentReceived ? (
        <div className="flex flex-col items-center justify-center text-center animate-fadeIn py-12">
          {/* Brand square logo */}
          <div className="w-8 h-8 rounded bg-black text-white flex items-center justify-center font-bold text-sm mb-6 shadow-xs">
            J
          </div>

          {/* Green checkmark circle */}
          <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4 animate-bounce">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-zinc-950 mb-1">
            Payment received
          </h2>
          <p className="text-xs text-zinc-500">
            Get ready!
          </p>
        </div>
      ) : (
        /* Payment QR Screen matching Still 8b92caf5.jpeg */
        <div className="w-full max-w-sm flex flex-col items-center text-center">
          {/* Brand square logo */}
          <div className="w-8 h-8 rounded bg-black text-white flex items-center justify-center font-bold text-sm mb-4 shadow-xs">
            J
          </div>

          <div className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 mb-1">
            QRPH VIA PAYMONGO
          </div>

          {/* Big Bold Amount */}
          <div className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight mb-0.5">
            PHP {config.pricePerSession.toFixed(2)}
          </div>

          <div className="text-[11px] font-mono text-zinc-400 mb-6">
            {refCode}
          </div>

          {/* Tab Switcher: QR or Voucher */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-full mb-5 text-xs">
            <button
              onClick={() => setActiveTab('qr')}
              className={`px-4 py-1.5 rounded-full font-medium transition cursor-pointer ${
                activeTab === 'qr'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Scan QR
            </button>
            <button
              onClick={() => setActiveTab('voucher')}
              className={`px-4 py-1.5 rounded-full font-medium transition cursor-pointer ${
                activeTab === 'voucher'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Voucher Code
            </button>
          </div>

          {activeTab === 'qr' ? (
            <div className="flex flex-col items-center">
              {/* High-contrast QR Container */}
              <div
                onClick={handleSimulatePayment}
                className="p-3 bg-white border border-zinc-200 rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition active:scale-98 relative group"
                title="Tap to simulate scan & payment"
              >
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Scan to Pay"
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-zinc-400 text-xs">
                    Loading QR...
                  </div>
                )}
                {/* Subtle tap helper overlay */}
                <div className="absolute inset-0 bg-white/90 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-semibold text-zinc-900">
                  Tap to Simulate Pay ✓
                </div>
              </div>

              {/* Status text matching Still 8b92caf5.jpeg */}
              <div className="mt-5 space-y-0.5 text-xs text-zinc-500">
                <p className="font-medium text-zinc-700">Auto-verification enabled</p>
                <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Checking payment</span>
                </p>
                <p className="text-[11px] font-mono text-zinc-400">
                  Expires in {formatExpiry(expirySec)}
                </p>
              </div>

              {/* Quick test bypass button */}
              <button
                onClick={handleSimulatePayment}
                disabled={isProcessing}
                className="mt-4 px-4 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium transition cursor-pointer"
              >
                {isProcessing ? 'Verifying...' : 'Simulate Scan & Pay'}
              </button>
            </div>
          ) : (
            /* Voucher Code Entry */
            <div className="w-full space-y-3">
              <input
                type="text"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                placeholder="Enter voucher code..."
                className="w-full px-4 py-3 rounded-xl border border-zinc-300 text-center uppercase tracking-widest font-mono text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />

              {voucherError && (
                <p className="text-xs text-rose-500">{voucherError}</p>
              )}
              {voucherSuccess && (
                <p className="text-xs text-emerald-600">{voucherSuccess}</p>
              )}

              <button
                onClick={handleRedeemVoucher}
                disabled={isProcessing}
                className="w-full py-3.5 rounded-full bg-black hover:bg-zinc-800 text-white font-medium text-sm transition cursor-pointer"
              >
                {isProcessing ? 'Validating...' : 'Apply Voucher'}
              </button>

              <div className="text-[11px] text-zinc-400">
                Try test code: <span className="font-mono font-bold text-zinc-600">VIP2026</span>
              </div>
            </div>
          )}

          {/* Bottom Cancel Button */}
          <button
            onClick={() => {
              soundEffects.playTap();
              onCancel();
            }}
            className="mt-6 text-xs text-zinc-500 hover:text-zinc-900 font-medium transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

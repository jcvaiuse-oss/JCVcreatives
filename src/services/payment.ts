/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import QRCode from 'qrcode';
import { PaymentTransaction, Voucher } from '../types';
import { storageService } from './storage';
import { soundEffects } from './soundEffects';

const SEEDED_VOUCHERS: Voucher[] = [
  {
    code: 'VIPFREE',
    discountPercent: 100,
    maxUses: 1000,
    usedCount: 0,
    description: 'VIP All-Access Free Photobooth Pass',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    active: true,
  },
  {
    code: 'PHOTO2025',
    discountPercent: 100,
    maxUses: 250,
    usedCount: 0,
    description: 'Special Event Complimentary Voucher',
    expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
    active: true,
  },
  {
    code: 'EVENTGUEST',
    discountPercent: 100,
    maxUses: 500,
    usedCount: 0,
    description: 'Event Guest Free Photo Session',
    expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    active: true,
  },
  {
    code: 'HALFPRICE',
    discountPercent: 50,
    maxUses: 100,
    usedCount: 0,
    description: '50% Off Photo Session Promo',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    active: true,
  },
];

const VOUCHER_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Computes a deterministic single-character checksum for offline cashier voucher verification.
 */
function computeVoucherChecksum(payload: string): string {
  const clean = payload.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  let hash = 29;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 37 + clean.charCodeAt(i) * (i + 3)) & 0xfffffff;
  }
  return VOUCHER_CHARSET[hash % VOUCHER_CHARSET.length];
}

/**
 * Verifies if an unknown code matches the JCV offline cashier voucher checksum format (e.g. JCV-XXXXC).
 */
function isValidOfflineSignedCashierCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  const match = normalized.match(/^([A-Z0-9]{2,6})-?([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5})$/);
  if (!match) return false;
  const prefix = match[1];
  const bodyWithCheck = match[2];
  const body = bodyWithCheck.slice(0, 4);
  const checkChar = bodyWithCheck.slice(4, 5);
  return computeVoucherChecksum(`${prefix}${body}`) === checkChar;
}

class PaymentService {
  private initialized = false;

  public async initVouchers(): Promise<void> {
    if (this.initialized) return;
    const existing = await storageService.getAllVouchers();
    if (existing.length === 0) {
      await storageService.saveVouchersBatch(SEEDED_VOUCHERS);
    }
    this.initialized = true;
  }

  /**
   * Batch generates single-use (or multi-use) cashier vouchers that work 100% offline.
   */
  public async generateCashierVouchersBatch(options: {
    count: number;
    prefix?: string;
    discountPercent?: number;
    maxUses?: number;
    batchName?: string;
    expiryDays?: number;
  }): Promise<Voucher[]> {
    await this.initVouchers();
    const count = Math.max(1, Math.min(500, Math.floor(options.count || 1)));
    const rawPrefix = (options.prefix || 'JCV').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const prefix = rawPrefix.slice(0, 6) || 'JCV';
    const discountPercent = options.discountPercent ?? 100;
    const maxUses = options.maxUses ?? 1;
    const expiryDays = options.expiryDays ?? 365;
    const now = Date.now();
    const batchName =
      options.batchName?.trim() ||
      `Cashier Batch (${new Date(now).toLocaleDateString([], { month: 'short', day: 'numeric' })})`;

    const existingList = await storageService.getAllVouchers();
    const existingCodes = new Set(existingList.map((v) => v.code.toUpperCase()));

    const generated: Voucher[] = [];
    let attempts = 0;

    while (generated.length < count && attempts < count * 20) {
      attempts++;
      let randPart = '';
      for (let i = 0; i < 4; i++) {
        const idx = Math.floor(Math.random() * VOUCHER_CHARSET.length);
        randPart += VOUCHER_CHARSET[idx];
      }
      const checkChar = computeVoucherChecksum(`${prefix}${randPart}`);
      const fullCode = `${prefix}-${randPart}${checkChar}`;

      if (!existingCodes.has(fullCode)) {
        existingCodes.add(fullCode);
        generated.push({
          code: fullCode,
          discountPercent,
          maxUses,
          usedCount: 0,
          description: batchName,
          expiresAt: now + expiryDays * 24 * 60 * 60 * 1000,
          active: true,
          createdAt: now,
          batchName,
          isCashierTicket: true,
        });
      }
    }

    await storageService.saveVouchersBatch(generated);
    return generated;
  }

  /**
   * Generates a QR Code Data URL for payment
   */
  public async generatePaymentQR(options: {
    transactionId: string;
    amount: number;
    currency: string;
    kioskId: string;
    method: 'pix' | 'cashapp' | 'generic';
  }): Promise<{ qrDataUrl: string; paymentUrl: string }> {
    const { transactionId, amount, currency, kioskId, method } = options;
    let paymentUrl = '';

    if (method === 'pix') {
      paymentUrl = `pix://payment?tx=${transactionId}&val=${amount.toFixed(2)}&kiosk=${kioskId}`;
    } else if (method === 'cashapp') {
      paymentUrl = `https://cash.app/$SnapKiosk/${amount}?note=PhotoSession_${transactionId}`;
    } else {
      paymentUrl = `https://pay.snapkiosk.io/checkout?tx=${transactionId}&amt=${amount}&cur=${currency}&kiosk=${kioskId}`;
    }

    const qrDataUrl = await QRCode.toDataURL(paymentUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return { qrDataUrl, paymentUrl };
  }

  /**
   * Validate and consume a voucher code (supports exact match, dash-omitted match, and offline signed cashier codes)
   */
  public async redeemVoucher(
    code: string,
    kioskId: string
  ): Promise<{ success: boolean; discountPercent: number; message: string; transaction?: PaymentTransaction }> {
    await this.initVouchers();
    const cleanCode = code.trim().toUpperCase();
    let voucher = await storageService.getVoucher(cleanCode);

    // If customer typed code without hyphen (e.g. JCV4829K instead of JCV-4829K), find matching stored voucher
    if (!voucher) {
      const strippedInput = cleanCode.replace(/[^A-Z0-9]/g, '');
      const allVouchers = await storageService.getAllVouchers();
      const matched = allVouchers.find(
        (v) => v.code.replace(/[^A-Z0-9]/g, '').toUpperCase() === strippedInput
      );
      if (matched) {
        voucher = matched;
      }
    }

    // If still not in local storage, check if it is a valid offline-signed cashier voucher generated on another station
    if (!voucher && isValidOfflineSignedCashierCode(cleanCode)) {
      const m = cleanCode.match(/^([A-Z0-9]{2,6})-?([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5})$/);
      const canonicalCode = m ? `${m[1]}-${m[2]}` : cleanCode;
      const existingCanonical = await storageService.getVoucher(canonicalCode);
      if (existingCanonical) {
        voucher = existingCanonical;
      } else {
        voucher = {
          code: canonicalCode,
          discountPercent: 100,
          maxUses: 1,
          usedCount: 0,
          description: 'Cashier Paid Session Voucher',
          expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
          active: true,
          createdAt: Date.now(),
          isCashierTicket: true,
        };
      }
    }

    if (!voucher) {
      return { success: false, discountPercent: 0, message: 'Invalid voucher code. Please check and try again.' };
    }

    if (!voucher.active) {
      return { success: false, discountPercent: 0, message: 'This voucher has been deactivated.' };
    }

    if (voucher.expiresAt && Date.now() > voucher.expiresAt) {
      return { success: false, discountPercent: 0, message: 'This voucher has expired.' };
    }

    if (voucher.maxUses > 0 && voucher.usedCount >= voucher.maxUses) {
      return {
        success: false,
        discountPercent: 0,
        message: 'This voucher code has already been used.',
      };
    }

    // Update voucher usage count & timestamp
    voucher.usedCount += 1;
    voucher.lastUsedAt = Date.now();
    await storageService.saveVoucher(voucher);

    // Record transaction
    const tx: PaymentTransaction = {
      id: `TX-VOUCHER-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      method: 'voucher',
      amount: 0,
      currency: 'PHP',
      status: 'completed',
      timestamp: Date.now(),
      voucherCode: voucher.code,
      kioskId,
    };

    await storageService.saveTransaction(tx);
    soundEffects.playSuccessChime();

    return {
      success: true,
      discountPercent: voucher.discountPercent,
      message: `Voucher redeemed! ${voucher.description}`,
      transaction: tx,
    };
  }

  /**
   * Process a QR Payment completion
   */
  public async completeQRPayment(
    transactionId: string,
    amount: number,
    currency: string,
    kioskId: string,
    method: 'qr_mock' | 'qr_pix' | 'qr_cashapp'
  ): Promise<PaymentTransaction> {
    const tx: PaymentTransaction = {
      id: transactionId,
      method,
      amount,
      currency,
      status: 'completed',
      timestamp: Date.now(),
      kioskId,
    };

    await storageService.saveTransaction(tx);
    soundEffects.playSuccessChime();
    return tx;
  }
}

export const paymentService = new PaymentService();

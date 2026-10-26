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

class PaymentService {
  private initialized = false;

  public async initVouchers(): Promise<void> {
    if (this.initialized) return;
    const existing = await storageService.getAllVouchers();
    if (existing.length === 0) {
      for (const v of SEEDED_VOUCHERS) {
        await storageService.saveVoucher(v);
      }
    }
    this.initialized = true;
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
   * Validate and consume a voucher code
   */
  public async redeemVoucher(
    code: string,
    kioskId: string
  ): Promise<{ success: boolean; discountPercent: number; message: string; transaction?: PaymentTransaction }> {
    await this.initVouchers();
    const cleanCode = code.trim().toUpperCase();
    const voucher = await storageService.getVoucher(cleanCode);

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
      return { success: false, discountPercent: 0, message: 'This voucher has reached its maximum redemptions.' };
    }

    // Update voucher usage count
    voucher.usedCount += 1;
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

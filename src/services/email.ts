/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EmailQueueItem } from '../types';
import { storageService } from './storage';

class EmailDeliveryService {
  private isProcessing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flushQueue();
      });
    }
  }

  /**
   * Send or queue an email with the photostrip capture
   */
  public async sendPhotoEmail(options: {
    recipientEmail: string;
    photostripId: string;
    photostripUrl: string;
    eventTitle: string;
  }): Promise<{ status: 'sent' | 'queued'; message: string }> {
    const { recipientEmail, photostripId, photostripUrl, eventTitle } = options;

    const queueItem: EmailQueueItem = {
      id: `EMAIL-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      recipientEmail: recipientEmail.trim(),
      photostripId,
      photostripUrl,
      eventTitle,
      queuedAt: Date.now(),
      status: 'queued',
      retries: 0,
    };

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (!isOnline) {
      // Store in offline queue
      await storageService.queueEmail(queueItem);
      return {
        status: 'queued',
        message: 'Offline mode active. Your photo has been queued and will be sent automatically as soon as internet is restored.',
      };
    }

    try {
      // Simulate real cloud SMTP / API dispatch
      await storageService.queueEmail(queueItem);
      await new Promise((resolve) => setTimeout(resolve, 800)); // Network latency

      await storageService.updateEmailStatus(queueItem.id, 'sent');
      return {
        status: 'sent',
        message: `High-resolution photos sent successfully to ${recipientEmail}! Check your inbox.`,
      };
    } catch {
      await storageService.updateEmailStatus(queueItem.id, 'failed');
      return {
        status: 'queued',
        message: 'Email service temporarily unavailable. Saved to queue for automatic retry.',
      };
    }
  }

  /**
   * Flush any queued offline emails once online
   */
  public async flushQueue(): Promise<{ processedCount: number }> {
    if (this.isProcessing) return { processedCount: 0 };
    this.isProcessing = true;

    try {
      const allQueued = await storageService.getQueuedEmails();
      const pending = allQueued.filter((item) => item.status === 'queued' || item.status === 'failed');

      let processed = 0;
      for (const item of pending) {
        try {
          await new Promise((r) => setTimeout(r, 400));
          await storageService.updateEmailStatus(item.id, 'sent');
          processed++;
        } catch {
          // Keep in queue
        }
      }

      return { processedCount: processed };
    } finally {
      this.isProcessing = false;
    }
  }
}

export const emailDeliveryService = new EmailDeliveryService();

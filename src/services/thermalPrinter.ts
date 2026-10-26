/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermalPrinterConfig } from '../types';
import { soundEffects } from './soundEffects';
import { safeStorageGet, safeStorageSet } from './storage';

export interface PrinterDeviceStatus {
  isConnected: boolean;
  connectionType: 'bluetooth' | 'usb' | 'virtual';
  deviceName: string;
  error?: string;
}

// Well known BLE service & characteristic UUIDs for ESC/POS thermal printers
const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Standard SPP BLE
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

const BLE_WRITE_CHARACTERISTICS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
];

class ThermalPrinterService {
  private bluetoothDevice: BluetoothDevice | null = null;
  private bluetoothCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private usbDevice: USBDevice | null = null;
  private usbEndpointNumber: number | null = null;

  private currentStatus: PrinterDeviceStatus = {
    isConnected: true,
    connectionType: 'virtual',
    deviceName: 'Virtual Thermal Printer (Built-in)',
  };

  private listeners: ((status: PrinterDeviceStatus) => void)[] = [];

  constructor() {
    // Check if previously connected in localStorage or default to virtual
    const savedType = safeStorageGet('snapkiosk_printer_type');
    if (savedType === 'bluetooth' || savedType === 'usb') {
      // Browsers require user gesture to re-open Bluetooth/USB, so start in virtual until connected
      this.currentStatus = {
        isConnected: false,
        connectionType: savedType,
        deviceName: `Saved ${savedType.toUpperCase()} Printer (tap to connect)`,
      };
    }
  }

  public subscribe(listener: (status: PrinterDeviceStatus) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentStatus);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentStatus));
  }

  public getStatus(): PrinterDeviceStatus {
    return this.currentStatus;
  }

  // Set to Virtual Simulator
  public useVirtualPrinter() {
    this.disconnect();
    this.currentStatus = {
      isConnected: true,
      connectionType: 'virtual',
      deviceName: 'Virtual Thermal Printer (Simulator)',
    };
    safeStorageSet('snapkiosk_printer_type', 'virtual');
    this.notify();
  }

  // Connect via Web Bluetooth API (Android Chrome & Tablets supported)
  public async connectBluetooth(): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      this.currentStatus = {
        isConnected: false,
        connectionType: 'bluetooth',
        deviceName: 'Bluetooth Not Supported',
        error: 'Web Bluetooth is not supported or not enabled in this browser. Use Android Chrome or Virtual Simulator.',
      };
      this.notify();
      return false;
    }

    try {
      // Request device with printer services or acceptAllDevices
      const device = await navigator.bluetooth!.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICES,
      });

      if (!device.gatt) {
        throw new Error('Device does not support GATT');
      }

      const server = await device.gatt.connect();
      let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

      // Scan through services to find a writable characteristic
      const services = await server.getPrimaryServices().catch(() => []);
      for (const service of services) {
        const characteristics = await service.getCharacteristics().catch(() => []);
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char;
            break;
          }
        }
        if (writeChar) break;
      }

      if (!writeChar) {
        throw new Error('Could not find writable printer characteristic. Ensure your Bluetooth printer is paired.');
      }

      this.bluetoothDevice = device;
      this.bluetoothCharacteristic = writeChar;

      device.addEventListener('gattserverdisconnected', () => {
        this.currentStatus = {
          isConnected: false,
          connectionType: 'bluetooth',
          deviceName: device.name || 'Bluetooth Printer',
          error: 'Printer disconnected',
        };
        this.notify();
      });

      this.currentStatus = {
        isConnected: true,
        connectionType: 'bluetooth',
        deviceName: device.name || 'Bluetooth Thermal Printer',
      };
      safeStorageSet('snapkiosk_printer_type', 'bluetooth');
      this.notify();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.currentStatus = {
        isConnected: false,
        connectionType: 'bluetooth',
        deviceName: 'Bluetooth Printer',
        error: msg,
      };
      this.notify();
      return false;
    }
  }

  // Connect via WebUSB API (USB OTG cable on Android Tablet)
  public async connectUSB(): Promise<boolean> {
    if (!('usb' in navigator)) {
      this.currentStatus = {
        isConnected: false,
        connectionType: 'usb',
        deviceName: 'WebUSB Not Supported',
        error: 'WebUSB is not supported in this browser. Use Android Chrome with USB OTG cable or Virtual Simulator.',
      };
      this.notify();
      return false;
    }

    try {
      // Standard USB printer class is 7, or scan all devices
      const device = await navigator.usb!.requestDevice({
        filters: [
          { classCode: 7 }, // Printer class
        ],
      }).catch(async () => {
        // Fallback to request all USB devices if class filter was too strict
        return await navigator.usb!.requestDevice({ filters: [] });
      });

      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      // Claim first interface
      await device.claimInterface(0);

      // Find OUT endpoint for writing
      let outEndpoint: number | null = null;
      const endpoints = device.configuration?.interfaces[0]?.alternate?.endpoints || [];
      for (const ep of endpoints) {
        if (ep.direction === 'out') {
          outEndpoint = ep.endpointNumber;
          break;
        }
      }

      if (outEndpoint === null) {
        throw new Error('No OUT bulk endpoint found on USB printer.');
      }

      this.usbDevice = device;
      this.usbEndpointNumber = outEndpoint;

      this.currentStatus = {
        isConnected: true,
        connectionType: 'usb',
        deviceName: device.productName || 'USB Thermal Printer',
      };
      safeStorageSet('snapkiosk_printer_type', 'usb');
      this.notify();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.currentStatus = {
        isConnected: false,
        connectionType: 'usb',
        deviceName: 'USB Printer',
        error: msg,
      };
      this.notify();
      return false;
    }
  }

  public disconnect() {
    if (this.bluetoothDevice && this.bluetoothDevice.gatt?.connected) {
      this.bluetoothDevice.gatt.disconnect();
    }
    this.bluetoothDevice = null;
    this.bluetoothCharacteristic = null;

    if (this.usbDevice) {
      this.usbDevice.close().catch(() => {});
      this.usbDevice = null;
      this.usbEndpointNumber = null;
    }
  }

  /**
   * Floyd-Steinberg error diffusion dithering.
   * Converts full RGB/grayscale canvas pixels to a crisp 1-bit monochrome bitmap
   * perfectly tuned for thermal receipt print heads.
   */
  public generateDitheredRaster(
    sourceCanvas: HTMLCanvasElement,
    targetWidth: number, // 384 for 58mm, 576 for 80mm
    contrastMultiplier: number = 1.15
  ): {
    bitmap: Uint8Array;
    width: number;
    height: number;
    previewDataUrl: string;
  } {
    // 1. Calculate proportional height rounded to multiple of 8 (required for byte packing)
    const ratio = sourceCanvas.height / sourceCanvas.width;
    const width = targetWidth;
    let height = Math.round(width * ratio);
    if (height % 8 !== 0) {
      height += 8 - (height % 8);
    }

    // 2. Render source image scaled onto working canvas
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Convert to grayscale 2D array for error diffusion
    const gray = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Luminance perception weighting
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Apply contrast curve
      lum = ((lum - 128) * contrastMultiplier) + 128;
      gray[i / 4] = Math.max(0, Math.min(255, lum));
    }

    // Create 1-bit monochrome pixel array (0 = white, 1 = black)
    const mono = new Uint8Array(width * height);

    // Floyd-Steinberg dithering algorithm
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = gray[idx];
        const newPixel = oldPixel < 128 ? 0 : 255;
        mono[idx] = newPixel === 0 ? 1 : 0; // 1 = black thermal dot

        const err = oldPixel - newPixel;

        if (x + 1 < width) {
          gray[idx + 1] += (err * 7) / 16;
        }
        if (x - 1 >= 0 && y + 1 < height) {
          gray[(y + 1) * width + (x - 1)] += (err * 3) / 16;
        }
        if (y + 1 < height) {
          gray[(y + 1) * width + x] += (err * 5) / 16;
        }
        if (x + 1 < width && y + 1 < height) {
          gray[(y + 1) * width + (x + 1)] += (err * 1) / 16;
        }
      }
    }

    // Build visual preview canvas for UI simulator & guest display
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = width;
    previewCanvas.height = height;
    const pCtx = previewCanvas.getContext('2d')!;
    const pImgData = pCtx.createImageData(width, height);
    for (let i = 0; i < mono.length; i++) {
      const pIdx = i * 4;
      const isBlack = mono[i] === 1;
      const val = isBlack ? 22 : 248; // Dark charcoal thermal burn on warm paper
      pImgData.data[pIdx] = val;
      pImgData.data[pIdx + 1] = isBlack ? 24 : 246;
      pImgData.data[pIdx + 2] = isBlack ? 28 : 242;
      pImgData.data[pIdx + 3] = 255;
    }
    pCtx.putImageData(pImgData, 0, 0);

    return {
      bitmap: mono,
      width,
      height,
      previewDataUrl: previewCanvas.toDataURL('image/png'),
    };
  }

  /**
   * Builds industry-standard ESC/POS raster byte sequence:
   * 1. ESC @ (Initialize printer)
   * 2. GS a 0 (Disable auto status back)
   * 3. ESC a 1 (Center alignment)
   * 4. GS v 0 0 xL xH yL yH (Standard raster bit image command)
   * 5. Feed lines
   * 6. GS V 66 0 (Paper cut)
   */
  public buildEscPosCommands(
    monoBitmap: Uint8Array,
    width: number,
    height: number,
    config: ThermalPrinterConfig
  ): Uint8Array {
    const bytesWidth = width / 8;
    const xL = bytesWidth % 256;
    const xH = Math.floor(bytesWidth / 256);
    const yL = height % 256;
    const yH = Math.floor(height / 256);

    const rasterBytesCount = bytesWidth * height;
    const packedBytes = new Uint8Array(rasterBytesCount);

    // Pack 8 horizontal monochrome bits into 1 byte (MSB first)
    for (let y = 0; y < height; y++) {
      for (let bx = 0; bx < bytesWidth; bx++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = bx * 8 + bit;
          const pixel = monoBitmap[y * width + pixelX];
          if (pixel === 1) {
            byteVal |= 0x80 >> bit;
          }
        }
        packedBytes[y * bytesWidth + bx] = byteVal;
      }
    }

    // Build complete command buffer
    const header = [
      0x1b, 0x40, // ESC @ (Initialize)
      0x1b, 0x61, 0x01, // ESC a 1 (Align center)
      0x1d, 0x76, 0x30, 0x00, // GS v 0 0 (Raster bit image normal mode)
      xL, xH, yL, yH,
    ];

    const feedAndCut = [
      0x1b, 0x64, config.feedLines || 0x04, // ESC d n (Feed n lines)
      0x1d, 0x56, 0x42, 0x00, // GS V 'B' 0 (Partial cut with feed)
    ];

    const totalLength = header.length + packedBytes.length + feedAndCut.length;
    const result = new Uint8Array(totalLength);
    result.set(header, 0);
    result.set(packedBytes, header.length);
    result.set(feedAndCut, header.length + packedBytes.length);

    return result;
  }

  /**
   * Executes the print job across Bluetooth, USB, or Virtual simulator.
   */
  public async print(
    canvas: HTMLCanvasElement,
    config: ThermalPrinterConfig,
    onProgress?: (percent: number, statusText: string) => void
  ): Promise<{ success: boolean; previewDataUrl: string; error?: string }> {
    soundEffects.playPrintingMotor();

    const targetWidth = config.paperWidthMm === 80 ? 576 : 384;
    const contrast = (config.contrast ?? 50) / 40; // 0.8 to 1.5

    onProgress?.(15, 'Dithering image for thermal head...');
    const dithered = this.generateDitheredRaster(canvas, targetWidth, contrast);

    onProgress?.(35, 'Compiling ESC/POS binary raster...');
    const escposBytes = this.buildEscPosCommands(dithered.bitmap, dithered.width, dithered.height, config);

    // Bluetooth Flow
    if (this.currentStatus.connectionType === 'bluetooth' && this.bluetoothCharacteristic) {
      try {
        onProgress?.(50, 'Sending data to Bluetooth thermal printer...');
        // Send in 128-byte BLE chunks to avoid buffer overflow
        const chunkSize = 128;
        for (let i = 0; i < escposBytes.length; i += chunkSize) {
          const chunk = escposBytes.slice(i, i + chunkSize);
          await this.bluetoothCharacteristic.writeValueWithoutResponse(chunk);
          const percent = 50 + Math.round((i / escposBytes.length) * 45);
          onProgress?.(percent, `Transmitting to printer... ${percent}%`);
          // Slight throttle between BLE packets
          await new Promise((r) => setTimeout(r, 12));
        }
        soundEffects.playPaperCut();
        onProgress?.(100, 'Print complete!');
        return { success: true, previewDataUrl: dithered.previewDataUrl };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, previewDataUrl: dithered.previewDataUrl, error: `Bluetooth print failed: ${msg}` };
      }
    }

    // USB Flow
    if (this.currentStatus.connectionType === 'usb' && this.usbDevice && this.usbEndpointNumber !== null) {
      try {
        onProgress?.(50, 'Sending data via USB OTG...');
        const chunkSize = 512;
        for (let i = 0; i < escposBytes.length; i += chunkSize) {
          const chunk = escposBytes.slice(i, i + chunkSize);
          await this.usbDevice.transferOut(this.usbEndpointNumber, chunk);
          const percent = 50 + Math.round((i / escposBytes.length) * 45);
          onProgress?.(percent, `Streaming to USB... ${percent}%`);
        }
        soundEffects.playPaperCut();
        onProgress?.(100, 'Print complete!');
        return { success: true, previewDataUrl: dithered.previewDataUrl };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, previewDataUrl: dithered.previewDataUrl, error: `USB print failed: ${msg}` };
      }
    }

    // Virtual Simulator Flow
    onProgress?.(60, 'Simulating thermal print head feed...');
    await new Promise((r) => setTimeout(r, 700));
    onProgress?.(85, 'Cutting thermal paper strip...');
    soundEffects.playPaperCut();
    await new Promise((r) => setTimeout(r, 400));
    onProgress?.(100, 'Thermal strip ready!');

    return {
      success: true,
      previewDataUrl: dithered.previewDataUrl,
    };
  }
}

export const thermalPrinterService = new ThermalPrinterService();

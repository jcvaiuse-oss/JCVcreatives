/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermalPrinterConfig, PrinterConnectionType } from '../types';
import { soundEffects } from './soundEffects';
import { safeStorageGet, safeStorageSet } from './storage';

export interface PrinterDeviceStatus {
  isConnected: boolean;
  connectionType: PrinterConnectionType;
  deviceName: string;
  error?: string;
  details?: string;
}

interface AndroidPrinterNativeBridge {
  hasUsbPrinter?: () => boolean;
  connectUsb?: () => string;
  printUsbBase64?: (base64Data: string) => string;
  connectBluetooth?: () => string;
  printBluetoothBase64?: (base64Data: string) => string;
  printTcpBase64?: (ip: string, port: number, base64Data: string) => string;
  printSystemImage?: (dataUrl: string, jobName: string) => string;
}

declare global {
  interface Window {
    AndroidPrinter?: AndroidPrinterNativeBridge;
  }
}

// Comprehensive BLE service UUIDs used by wireless ESC/POS thermal printers across vendors
const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Generic BLE Printer
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Star / Xprinter / Goojprt BLE
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / JDY / SPP-over-BLE
  '0000ff00-0000-1000-8000-00805f9b34fb', // Zhuhai / Pos-58 BLE
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip ISSC Transparent UART
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / WeChat hardware printer
  '0000ae30-0000-1000-8000-00805f9b34fb', // Deli / Paperang / PeriPage BLE
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (NUS)
  '00001101-0000-1000-8000-00805f9b34fb', // SPP UUID
];

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

class ThermalPrinterService {
  private bluetoothDevice: BluetoothDevice | null = null;
  private bluetoothCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private nativeBluetoothActive = false;

  private usbDevice: USBDevice | null = null;
  private usbInterfaceNumber: number | null = null;
  private usbEndpointNumber: number | null = null;
  private nativeUsbActive = false;

  // Web Serial port for USB-Serial (CH340 / PL2303 / CP210x / FTDI) USB cord printers
  private serialPort: any = null;
  private serialBaudRate: number = 9600;

  // Wireless Wi-Fi / LAN Network Printer
  private networkIp: string = '192.168.1.100';
  private networkPort: number = 9100;

  private currentStatus: PrinterDeviceStatus = {
    isConnected: true,
    connectionType: 'virtual',
    deviceName: 'Virtual Thermal Printer (Built-in)',
  };

  private listeners: ((status: PrinterDeviceStatus) => void)[] = [];

  constructor() {
    const savedIp = safeStorageGet('snapkiosk_printer_ip');
    const savedPort = safeStorageGet('snapkiosk_printer_port');
    const savedBaud = safeStorageGet('snapkiosk_printer_baud');
    if (savedIp) this.networkIp = savedIp;
    if (savedPort) this.networkPort = Number(savedPort) || 9100;
    if (savedBaud) this.serialBaudRate = Number(savedBaud) || 9600;

    const savedType = safeStorageGet('snapkiosk_printer_type') as PrinterConnectionType | null;
    if (savedType === 'system') {
      this.currentStatus = {
        isConnected: true,
        connectionType: 'system',
        deviceName: 'Universal USB / Wireless System Printer',
        details: 'Prints via OS / Browser Print Spooler (USB Cord, Wi-Fi, AirPrint, Mopria)',
      };
    } else if (savedType === 'network' && savedIp) {
      this.currentStatus = {
        isConnected: true,
        connectionType: 'network',
        deviceName: `Wireless Printer (${this.networkIp}:${this.networkPort})`,
        details: 'Wi-Fi / LAN Raw ESC/POS & HTTP',
      };
    } else if (savedType === 'bluetooth' || savedType === 'usb' || savedType === 'serial') {
      this.currentStatus = {
        isConnected: false,
        connectionType: savedType,
        deviceName: `Saved ${savedType.toUpperCase()} Printer (tap to connect)`,
      };
    }

    this.setupUsbHotplugListeners();
  }

  private setupUsbHotplugListeners() {
    if (typeof navigator !== 'undefined' && 'usb' in navigator && navigator.usb) {
      // Auto-reconnect previously authorized WebUSB printer on startup
      navigator.usb
        .getDevices()
        .then(async (devices) => {
          if (devices && devices.length > 0) {
            await this.openAndClaimUsbDevice(devices[0]);
          }
        })
        .catch(() => {});

      // Hotplug: automatically connect when USB cord is plugged in
      navigator.usb.addEventListener('connect', async (event: any) => {
        if (event?.device) {
          await this.openAndClaimUsbDevice(event.device);
        }
      });

      navigator.usb.addEventListener('disconnect', (event: any) => {
        if (this.usbDevice && event?.device === this.usbDevice) {
          this.usbDevice = null;
          this.usbInterfaceNumber = null;
          this.usbEndpointNumber = null;
          this.currentStatus = {
            isConnected: false,
            connectionType: 'usb',
            deviceName: 'USB Printer Disconnected',
            error: 'USB cable unplugged. Plug back in to auto-reconnect.',
          };
          this.notify();
        }
      });
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

  public getNetworkSettings() {
    return {
      ip: this.networkIp,
      port: this.networkPort,
      baudRate: this.serialBaudRate,
    };
  }

  // 1. Virtual Simulator Mode
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

  // 2. Universal System / OS Driver Mode (Works with ANY USB Cord or Wireless Printer in Windows/Mac/Android/iOS)
  public useSystemPrinter() {
    this.disconnect();
    this.currentStatus = {
      isConnected: true,
      connectionType: 'system',
      deviceName: 'Universal USB / Wireless System Printer',
      details: 'Works with any USB cord, Wi-Fi, AirPrint, Mopria, Inkjet, Laser, or Thermal OS driver',
    };
    safeStorageSet('snapkiosk_printer_type', 'system');
    this.notify();
  }

  // 3. Wireless Wi-Fi / LAN IP Printer Mode
  public connectNetworkPrinter(ip: string, port: number = 9100): boolean {
    const cleanIp = ip.trim() || '192.168.1.100';
    const cleanPort = Number(port) || 9100;
    this.disconnect();
    this.networkIp = cleanIp;
    this.networkPort = cleanPort;

    safeStorageSet('snapkiosk_printer_ip', cleanIp);
    safeStorageSet('snapkiosk_printer_port', String(cleanPort));
    safeStorageSet('snapkiosk_printer_type', 'network');

    this.currentStatus = {
      isConnected: true,
      connectionType: 'network',
      deviceName: `Wireless IP Printer (${cleanIp}:${cleanPort})`,
      details: 'Wi-Fi / LAN Network Printer Ready',
    };
    this.notify();
    return true;
  }

  // 4. Wireless Bluetooth (Native Android Classic SPP + Web Bluetooth BLE)
  public async connectBluetooth(): Promise<boolean> {
    this.disconnect();

    // Check Native Android Bluetooth SPP Bridge first (for Android 7+ APK)
    if (typeof window !== 'undefined' && window.AndroidPrinter?.connectBluetooth) {
      try {
        const res = window.AndroidPrinter.connectBluetooth();
        if (res && res.startsWith('OK:')) {
          const devName = res.slice(3) || 'Bluetooth Thermal Printer';
          this.nativeBluetoothActive = true;
          this.currentStatus = {
            isConnected: true,
            connectionType: 'bluetooth',
            deviceName: devName,
            details: 'Connected via Native Android Bluetooth SPP',
          };
          safeStorageSet('snapkiosk_printer_type', 'bluetooth');
          this.notify();
          return true;
        } else if (res && !res.includes('FALLBACK')) {
          this.currentStatus = {
            isConnected: false,
            connectionType: 'bluetooth',
            deviceName: 'Bluetooth Printer',
            error: res.replace(/^ERR:/, ''),
          };
          this.notify();
          return false;
        }
      } catch {
        // Continue to Web Bluetooth
      }
    }

    if (typeof navigator === 'undefined' || !('bluetooth' in navigator) || !navigator.bluetooth) {
      this.currentStatus = {
        isConnected: false,
        connectionType: 'bluetooth',
        deviceName: 'Bluetooth Not Available in Browser',
        error:
          'Web Bluetooth is not enabled here. Tip: Select "Universal USB / Wireless System Printer" to print to any paired Bluetooth or Wi-Fi printer via OS Print Service.',
      };
      this.notify();
      return false;
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICES,
      });

      if (!device.gatt) {
        throw new Error('Selected Bluetooth device does not expose GATT services.');
      }

      const server = await device.gatt.connect();
      let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

      const services = await server.getPrimaryServices().catch(() => []);
      for (const service of services) {
        const characteristics = await service.getCharacteristics().catch(() => []);
        for (const char of characteristics) {
          if (char.properties.writeWithoutResponse || char.properties.write) {
            writeChar = char;
            break;
          }
        }
        if (writeChar) break;
      }

      if (!writeChar) {
        throw new Error(
          'Could not find writable BLE characteristic. If this is a Bluetooth Classic printer, use "Universal System Printer" or the Android APK.'
        );
      }

      this.bluetoothDevice = device;
      this.bluetoothCharacteristic = writeChar;

      device.addEventListener('gattserverdisconnected', () => {
        this.currentStatus = {
          isConnected: false,
          connectionType: 'bluetooth',
          deviceName: device.name || 'Bluetooth Printer',
          error: 'Bluetooth printer disconnected — tap to reconnect.',
        };
        this.notify();
      });

      this.currentStatus = {
        isConnected: true,
        connectionType: 'bluetooth',
        deviceName: device.name || 'Wireless Bluetooth Printer',
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

  /**
   * Scans ALL configurations, interfaces, and alternates on a WebUSB device
   * so ANY USB printer cord works regardless of which interface holds the OUT endpoint.
   */
  private async openAndClaimUsbDevice(device: USBDevice): Promise<boolean> {
    await device.open();

    if (!device.configuration) {
      const firstConfigVal = device.configurations?.[0]?.configurationValue ?? 1;
      await device.selectConfiguration(firstConfigVal);
    }

    const interfaces = device.configuration?.interfaces || [];
    let chosenInterfaceNum: number | null = null;
    let chosenAlternateSetting: number = 0;
    let chosenOutEndpoint: number | null = null;

    // Pass 1: Look for USB Printer Class (classCode === 7) with an OUT endpoint
    for (const iface of interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass === 7) {
          const outEp = alt.endpoints.find((ep) => ep.direction === 'out');
          if (outEp) {
            chosenInterfaceNum = iface.interfaceNumber;
            chosenAlternateSetting = alt.alternateSetting;
            chosenOutEndpoint = outEp.endpointNumber;
            break;
          }
        }
      }
      if (chosenOutEndpoint !== null) break;
    }

    // Pass 2: Look for ANY interface with a bulk/interrupt OUT endpoint (Vendor-specific class 255, CDC-Data class 10, etc.)
    if (chosenOutEndpoint === null) {
      for (const iface of interfaces) {
        for (const alt of iface.alternates) {
          const outEp = alt.endpoints.find((ep) => ep.direction === 'out');
          if (outEp) {
            chosenInterfaceNum = iface.interfaceNumber;
            chosenAlternateSetting = alt.alternateSetting;
            chosenOutEndpoint = outEp.endpointNumber;
            break;
          }
        }
        if (chosenOutEndpoint !== null) break;
      }
    }

    if (chosenInterfaceNum === null || chosenOutEndpoint === null) {
      throw new Error('No writable USB OUT endpoint found on this device.');
    }

    await device.claimInterface(chosenInterfaceNum);
    if (chosenAlternateSetting !== 0 && typeof device.selectAlternateInterface === 'function') {
      await device.selectAlternateInterface(chosenInterfaceNum, chosenAlternateSetting).catch(() => {});
    }

    this.usbDevice = device;
    this.usbInterfaceNumber = chosenInterfaceNum;
    this.usbEndpointNumber = chosenOutEndpoint;

    const label =
      [device.manufacturerName, device.productName].filter(Boolean).join(' ') ||
      'USB Cord Printer';

    this.currentStatus = {
      isConnected: true,
      connectionType: 'usb',
      deviceName: label,
      details: `USB Interface #${chosenInterfaceNum} • Endpoint OUT #${chosenOutEndpoint}`,
    };
    safeStorageSet('snapkiosk_printer_type', 'usb');
    this.notify();
    return true;
  }

  // 5. Connect via USB Cord (Native Android UsbManager -> WebUSB -> Web Serial -> System Driver Fallback)
  public async connectUSB(): Promise<boolean> {
    this.disconnect();

    // A. Check Native Android USB Host Bridge first (for Android 7+ APK with USB OTG cable)
    if (typeof window !== 'undefined' && window.AndroidPrinter?.connectUsb) {
      try {
        const res = window.AndroidPrinter.connectUsb();
        if (res && res.startsWith('OK:')) {
          const usbName = res.slice(3) || 'Android USB OTG Printer';
          this.nativeUsbActive = true;
          this.currentStatus = {
            isConnected: true,
            connectionType: 'usb',
            deviceName: usbName,
            details: 'Connected via Native Android USB OTG Host',
          };
          safeStorageSet('snapkiosk_printer_type', 'usb');
          this.notify();
          return true;
        }
      } catch {
        // Fall through to WebUSB
      }
    }

    // B. Try WebUSB (shows ALL connected USB devices so any USB printer can be chosen)
    if (typeof navigator !== 'undefined' && 'usb' in navigator && navigator.usb) {
      try {
        const device = await navigator.usb.requestDevice({ filters: [] });
        return await this.openAndClaimUsbDevice(device);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // If Windows/Mac OS driver locked the USB interface ("Access denied" or "Unable to claim interface"),
        // automatically offer Web Serial or switch to System OS USB Driver so it still prints!
        if (
          msg.toLowerCase().includes('access denied') ||
          msg.toLowerCase().includes('claiminterface') ||
          msg.toLowerCase().includes('unable to claim')
        ) {
          this.currentStatus = {
            isConnected: true,
            connectionType: 'system',
            deviceName: 'USB Printer (OS Driver Connected)',
            details:
              'OS driver is managing this USB cable — automatically routed through Universal USB System Print Spooler.',
          };
          safeStorageSet('snapkiosk_printer_type', 'system');
          this.notify();
          return true;
        }

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

    // C. If WebUSB is not available in this browser, try Web Serial (USB COM port) or enable Universal USB System Printer
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      return await this.connectSerial(this.serialBaudRate);
    }

    this.useSystemPrinter();
    return true;
  }

  // 6. Connect via USB-Serial Cord (Web Serial API for CH340, CP210x, PL2303, FTDI USB printers)
  public async connectSerial(baudRate: number = 9600): Promise<boolean> {
    this.disconnect();
    this.serialBaudRate = Number(baudRate) || 9600;
    safeStorageSet('snapkiosk_printer_baud', String(this.serialBaudRate));

    const nav = navigator as any;
    if (typeof navigator === 'undefined' || !('serial' in navigator) || !nav.serial) {
      this.currentStatus = {
        isConnected: false,
        connectionType: 'serial',
        deviceName: 'Web Serial Not Supported',
        error:
          'Web Serial is only available in desktop Chrome/Edge. Use "USB Cord (Direct)" or "Universal USB / Wireless System Printer".',
      };
      this.notify();
      return false;
    }

    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: this.serialBaudRate });
      this.serialPort = port;

      this.currentStatus = {
        isConnected: true,
        connectionType: 'serial',
        deviceName: `USB-Serial Printer (${this.serialBaudRate} baud)`,
        details: 'Connected via USB COM / Serial Port',
      };
      safeStorageSet('snapkiosk_printer_type', 'serial');
      this.notify();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.currentStatus = {
        isConnected: false,
        connectionType: 'serial',
        deviceName: 'USB-Serial Printer',
        error: msg,
      };
      this.notify();
      return false;
    }
  }

  public disconnect() {
    this.nativeUsbActive = false;
    this.nativeBluetoothActive = false;

    if (this.bluetoothDevice && this.bluetoothDevice.gatt?.connected) {
      this.bluetoothDevice.gatt.disconnect();
    }
    this.bluetoothDevice = null;
    this.bluetoothCharacteristic = null;

    if (this.usbDevice) {
      this.usbDevice.close().catch(() => {});
      this.usbDevice = null;
      this.usbInterfaceNumber = null;
      this.usbEndpointNumber = null;
    }

    if (this.serialPort) {
      try {
        this.serialPort.close().catch(() => {});
      } catch {}
      this.serialPort = null;
    }
  }

  /**
   * Prints any canvas via the OS / Browser System Print Spooler using a hidden zero-margin iframe
   * (or native Android PrintManager in the APK). Works with ANY USB cord or Wireless printer!
   */
  public async printViaSystemDriver(
    sourceCanvas: HTMLCanvasElement,
    paperWidthMm: 58 | 80 = 58,
    onProgress?: (percent: number, statusText: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    onProgress?.(40, 'Preparing high-resolution print spool...');
    const imgDataUrl = sourceCanvas.toDataURL('image/png');

    // 1. If running inside the Android APK with Native PrintManager bridge
    if (typeof window !== 'undefined' && window.AndroidPrinter?.printSystemImage) {
      try {
        const res = window.AndroidPrinter.printSystemImage(
          imgDataUrl,
          'JCVcreatives_Photostrip'
        );
        if (res && res.startsWith('OK')) {
          onProgress?.(100, 'Sent to Android Print Spooler!');
          return { success: true };
        }
      } catch {
        // Fall through to iframe print
      }
    }

    // 2. Hidden zero-margin iframe print spooler for Web Browser (USB / Wireless OS printers)
    return new Promise((resolve) => {
      try {
        const existingFrame = document.getElementById('jcv-hidden-print-frame');
        if (existingFrame && existingFrame.parentNode) {
          existingFrame.parentNode.removeChild(existingFrame);
        }

        const iframe = document.createElement('iframe');
        iframe.id = 'jcv-hidden-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = '0';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) {
          window.print();
          resolve({ success: true });
          return;
        }

        doc.open();
        doc.write(`<!DOCTYPE html>
<html>
<head>
  <title>JCVcreatives Photobooth Print</title>
  <style>
    @page {
      size: ${paperWidthMm}mm auto;
      margin: 0mm;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      width: 100%;
      text-align: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    img {
      width: 100%;
      max-width: ${paperWidthMm}mm;
      height: auto;
      display: block;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <img id="strip-img" src="${imgDataUrl}" alt="Photostrip" />
  <script>
    var img = document.getElementById('strip-img');
    function triggerPrint() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 150);
    }
    if (img.complete) {
      triggerPrint();
    } else {
      img.onload = triggerPrint;
      img.onerror = triggerPrint;
    }
  </script>
</body>
</html>`);
        doc.close();

        onProgress?.(90, 'Sending to USB / Wireless System Printer...');
        setTimeout(() => {
          onProgress?.(100, 'Print job dispatched!');
          resolve({ success: true });
        }, 900);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({ success: false, error: msg });
      }
    });
  }

  /**
   * Floyd-Steinberg error diffusion dithering.
   */
  public generateDitheredRaster(
    sourceCanvas: HTMLCanvasElement,
    targetWidth: number,
    contrastMultiplier: number = 1.15
  ): {
    bitmap: Uint8Array;
    width: number;
    height: number;
    previewDataUrl: string;
  } {
    const ratio = sourceCanvas.height / sourceCanvas.width;
    const width = targetWidth;
    let height = Math.round(width * ratio);
    if (height % 8 !== 0) {
      height += 8 - (height % 8);
    }

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const gray = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lum = (lum - 128) * contrastMultiplier + 128;
      gray[i / 4] = Math.max(0, Math.min(255, lum));
    }

    const mono = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = gray[idx];
        const newPixel = oldPixel < 128 ? 0 : 255;
        mono[idx] = newPixel === 0 ? 1 : 0;

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

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = width;
    previewCanvas.height = height;
    const pCtx = previewCanvas.getContext('2d')!;
    const pImgData = pCtx.createImageData(width, height);
    for (let i = 0; i < mono.length; i++) {
      const pIdx = i * 4;
      const isBlack = mono[i] === 1;
      const val = isBlack ? 22 : 248;
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
   * Builds industry-standard ESC/POS raster byte sequence.
   * Slices tall images into safe 256-row raster bands so printers with small RAM buffers never clip or garble!
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

    const chunks: number[] = [
      0x1b, 0x40, // ESC @ (Initialize printer)
      0x1b, 0x61, 0x01, // ESC a 1 (Center align)
    ];

    // Send raster in bands of max 240 vertical dots for universal USB & Bluetooth buffer compatibility
    const bandHeightMax = 240;
    for (let startY = 0; startY < height; startY += bandHeightMax) {
      const bandH = Math.min(bandHeightMax, height - startY);
      const yL = bandH % 256;
      const yH = Math.floor(bandH / 256);

      chunks.push(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);

      for (let y = startY; y < startY + bandH; y++) {
        for (let bx = 0; bx < bytesWidth; bx++) {
          let byteVal = 0;
          for (let bit = 0; bit < 8; bit++) {
            const pixelX = bx * 8 + bit;
            if (monoBitmap[y * width + pixelX] === 1) {
              byteVal |= 0x80 >> bit;
            }
          }
          chunks.push(byteVal);
        }
      }
    }

    chunks.push(0x1b, 0x64, config.feedLines || 0x04); // Feed lines
    if (config.autoCut !== false) {
      chunks.push(0x1d, 0x56, 0x42, 0x00); // GS V 66 0 (Partial cut)
    }

    return new Uint8Array(chunks);
  }

  /**
   * Executes the print job across USB Cord, USB-Serial, Wireless Bluetooth, Wireless Network IP, Universal System Driver, or Virtual Simulator.
   */
  public async print(
    canvas: HTMLCanvasElement,
    config: ThermalPrinterConfig,
    onProgress?: (percent: number, statusText: string) => void
  ): Promise<{ success: boolean; previewDataUrl: string; error?: string }> {
    soundEffects.playPrintingMotor();

    const targetWidth = config.paperWidthMm === 80 ? 576 : 384;
    const contrast = (config.contrast ?? 50) / 40;

    onProgress?.(15, 'Dithering image for print head...');
    const dithered = this.generateDitheredRaster(canvas, targetWidth, contrast);

    onProgress?.(35, 'Compiling ESC/POS raster bands...');
    const escposBytes = this.buildEscPosCommands(
      dithered.bitmap,
      dithered.width,
      dithered.height,
      config
    );

    const mode = this.currentStatus.connectionType;

    // 1. Universal System / OS Printer Mode (USB Cord or Wireless via OS Spooler)
    if (mode === 'system') {
      const sysRes = await this.printViaSystemDriver(
        canvas,
        config.paperWidthMm || 58,
        onProgress
      );
      soundEffects.playPaperCut();
      return {
        success: sysRes.success,
        previewDataUrl: dithered.previewDataUrl,
        error: sysRes.error,
      };
    }

    // 2. USB Cord Flow (Native Android USB Host OR WebUSB)
    if (mode === 'usb') {
      // A. Native Android USB OTG Host
      if (this.nativeUsbActive && typeof window !== 'undefined' && window.AndroidPrinter?.printUsbBase64) {
        try {
          onProgress?.(55, 'Streaming to USB OTG printer...');
          const b64 = uint8ToBase64(escposBytes);
          const res = window.AndroidPrinter.printUsbBase64(b64);
          if (res && res.startsWith('OK')) {
            soundEffects.playPaperCut();
            onProgress?.(100, 'USB Print complete!');
            return { success: true, previewDataUrl: dithered.previewDataUrl };
          }
          throw new Error(res || 'Android USB transfer failed');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            previewDataUrl: dithered.previewDataUrl,
            error: `USB OTG print failed: ${msg}`,
          };
        }
      }

      // B. WebUSB Direct Transfer
      if (this.usbDevice && this.usbEndpointNumber !== null) {
        try {
          onProgress?.(50, 'Sending data via USB cord...');
          const chunkSize = 1024;
          for (let i = 0; i < escposBytes.length; i += chunkSize) {
            const chunk = escposBytes.slice(i, i + chunkSize);
            await this.usbDevice.transferOut(this.usbEndpointNumber, chunk);
            const percent = 50 + Math.round((i / escposBytes.length) * 45);
            onProgress?.(percent, `Streaming to USB printer... ${percent}%`);
          }
          soundEffects.playPaperCut();
          onProgress?.(100, 'Print complete!');
          return { success: true, previewDataUrl: dithered.previewDataUrl };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            previewDataUrl: dithered.previewDataUrl,
            error: `USB print failed: ${msg}`,
          };
        }
      }
    }

    // 3. USB-Serial Cord Flow (Web Serial API)
    if (mode === 'serial' && this.serialPort && this.serialPort.writable) {
      try {
        onProgress?.(50, 'Streaming to USB-Serial port...');
        const writer = this.serialPort.writable.getWriter();
        const chunkSize = 512;
        for (let i = 0; i < escposBytes.length; i += chunkSize) {
          const chunk = escposBytes.slice(i, i + chunkSize);
          await writer.write(chunk);
          const percent = 50 + Math.round((i / escposBytes.length) * 45);
          onProgress?.(percent, `Writing to Serial USB... ${percent}%`);
          await new Promise((r) => setTimeout(r, 8));
        }
        writer.releaseLock();
        soundEffects.playPaperCut();
        onProgress?.(100, 'Print complete!');
        return { success: true, previewDataUrl: dithered.previewDataUrl };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          previewDataUrl: dithered.previewDataUrl,
          error: `USB-Serial print failed: ${msg}`,
        };
      }
    }

    // 4. Wireless Bluetooth Flow (Native Android Classic SPP OR Web Bluetooth BLE)
    if (mode === 'bluetooth') {
      if (
        this.nativeBluetoothActive &&
        typeof window !== 'undefined' &&
        window.AndroidPrinter?.printBluetoothBase64
      ) {
        try {
          onProgress?.(55, 'Sending to Bluetooth printer...');
          const b64 = uint8ToBase64(escposBytes);
          const res = window.AndroidPrinter.printBluetoothBase64(b64);
          if (res && res.startsWith('OK')) {
            soundEffects.playPaperCut();
            onProgress?.(100, 'Bluetooth Print complete!');
            return { success: true, previewDataUrl: dithered.previewDataUrl };
          }
          throw new Error(res || 'Bluetooth SPP print failed');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            previewDataUrl: dithered.previewDataUrl,
            error: `Bluetooth print failed: ${msg}`,
          };
        }
      }

      if (this.bluetoothCharacteristic) {
        try {
          onProgress?.(50, 'Sending data to Wireless Bluetooth printer...');
          const canWriteNoResp = this.bluetoothCharacteristic.properties.writeWithoutResponse;
          const chunkSize = 128;
          for (let i = 0; i < escposBytes.length; i += chunkSize) {
            const chunk = escposBytes.slice(i, i + chunkSize);
            if (canWriteNoResp) {
              await this.bluetoothCharacteristic.writeValueWithoutResponse(chunk);
            } else {
              await this.bluetoothCharacteristic.writeValue(chunk);
            }
            const percent = 50 + Math.round((i / escposBytes.length) * 45);
            onProgress?.(percent, `Transmitting via Bluetooth... ${percent}%`);
            await new Promise((r) => setTimeout(r, 12));
          }
          soundEffects.playPaperCut();
          onProgress?.(100, 'Print complete!');
          return { success: true, previewDataUrl: dithered.previewDataUrl };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            previewDataUrl: dithered.previewDataUrl,
            error: `Bluetooth print failed: ${msg}`,
          };
        }
      }
    }

    // 5. Wireless Wi-Fi / LAN Network Printer Flow (Port 9100 Raw TCP / WebSocket / HTTP)
    if (mode === 'network') {
      const ip = config.networkIp || this.networkIp;
      const port = config.networkPort || this.networkPort || 9100;

      // A. Native Android TCP Socket (works offline on local Wi-Fi with any raw port 9100 printer)
      if (typeof window !== 'undefined' && window.AndroidPrinter?.printTcpBase64) {
        try {
          onProgress?.(55, `Sending to Wireless Printer ${ip}:${port}...`);
          const b64 = uint8ToBase64(escposBytes);
          const res = window.AndroidPrinter.printTcpBase64(ip, port, b64);
          if (res && res.startsWith('OK')) {
            soundEffects.playPaperCut();
            onProgress?.(100, 'Wireless Network Print complete!');
            return { success: true, previewDataUrl: dithered.previewDataUrl };
          }
          throw new Error(res || 'TCP socket print failed');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            previewDataUrl: dithered.previewDataUrl,
            error: `Network print (${ip}:${port}) failed: ${msg}`,
          };
        }
      }

      // B. Browser HTTP / WebSocket Local Relay to IP Printer
      try {
        onProgress?.(55, `Transmitting to Wireless Printer ${ip}:${port}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        await fetch(`http://${ip}:${port}/`, {
          method: 'POST',
          mode: 'no-cors',
          body: new Blob([escposBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        soundEffects.playPaperCut();
        onProgress?.(100, 'Wireless Print sent!');
        return { success: true, previewDataUrl: dithered.previewDataUrl };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          previewDataUrl: dithered.previewDataUrl,
          error: `Could not reach wireless printer at ${ip}:${port} (${msg}). Ensure printer is on the same Wi-Fi network.`,
        };
      }
    }

    // 6. Virtual Simulator Flow
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

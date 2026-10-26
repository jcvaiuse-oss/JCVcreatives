/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: string, listener: (this: BluetoothDevice, ev: Event) => void): void;
  removeEventListener(type: string, listener: (this: BluetoothDevice, ev: Event) => void): void;
}

interface BluetoothRemoteGATTServer {
  device: BluetoothDevice;
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  uuid: string;
  isPrimary: boolean;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  uuid: string;
  properties: {
    write?: boolean;
    writeWithoutResponse?: boolean;
    read?: boolean;
    notify?: boolean;
  };
  writeValueWithoutResponse(data: BufferSource): Promise<void>;
  writeValue(data: BufferSource): Promise<void>;
  readValue(): Promise<DataView>;
}

interface Bluetooth {
  requestDevice(options: {
    filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>;
    optionalServices?: string[];
    acceptAllDevices?: boolean;
  }): Promise<BluetoothDevice>;
}

interface USBDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration: {
    interfaces: Array<{
      interfaceNumber: number;
      alternate: {
        endpoints: Array<{
          endpointNumber: number;
          direction: 'in' | 'out';
          type: string;
        }>;
      };
    }>;
  } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<{ bytesWritten: number; status: string }>;
}

interface USB {
  requestDevice(options: {
    filters: Array<{ vendorId?: number; productId?: number; classCode?: number }>;
  }): Promise<USBDevice>;
}

interface Navigator {
  bluetooth?: Bluetooth;
  usb?: USB;
}

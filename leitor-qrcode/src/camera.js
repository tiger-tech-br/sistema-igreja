import { Capacitor } from '@capacitor/core';

export async function createCamera({ onRead, onError }) {
  return Capacitor.isNativePlatform() ? createNativeCamera(onRead, onError) : createWebCamera(onRead);
}

async function createNativeCamera(onRead, onError) {
  const { BarcodeScanner, BarcodeFormat, LensFacing, Resolution } = await import('@capacitor-mlkit/barcode-scanning');
  let running = false;
  let scanListener;
  let errorListener;
  return {
    get running() { return running; },
    async start() {
      if (running) return;
      const { supported } = await BarcodeScanner.isSupported();
      if (!supported) throw new Error('A leitura de QR Code não está disponível neste aparelho.');
      let permission = await BarcodeScanner.checkPermissions();
      if (permission.camera !== 'granted') permission = await BarcodeScanner.requestPermissions();
      if (permission.camera !== 'granted') throw new Error('Permita o acesso à câmera nas configurações do aplicativo para escanear.');
      scanListener = await BarcodeScanner.addListener('barcodesScanned', ({ barcodes }) => {
        // Uma requisição por vez, mesmo se houver vários QR Codes no enquadramento.
        const raw = barcodes?.find(code => code.rawValue)?.rawValue;
        if (raw) onRead(raw);
      });
      errorListener = await BarcodeScanner.addListener('scanError', () => onError(new Error('A câmera foi interrompida. Ative-a novamente para continuar.')));
      try {
        document.documentElement.classList.add('native-camera-active');
        await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode], lensFacing: LensFacing.Back, resolution: Resolution['1280x720'] });
        running = true;
      } catch (error) {
        document.documentElement.classList.remove('native-camera-active');
        await scanListener?.remove();
        await errorListener?.remove();
        throw error;
      }
    },
    async stop() {
      await scanListener?.remove();
      await errorListener?.remove();
      scanListener = null;
      errorListener = null;
      try { if (running) await BarcodeScanner.stopScan(); }
      finally { running = false; document.documentElement.classList.remove('native-camera-active'); }
    },
    async hasTorch() { return (await BarcodeScanner.isTorchAvailable()).available; },
    async setTorch(enabled) { await (enabled ? BarcodeScanner.enableTorch() : BarcodeScanner.disableTorch()); }
  };
}

async function createWebCamera(onRead) {
  const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
  const scanner = new Html5Qrcode('reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
  let running = false;
  return {
    get running() { return running; },
    async start() {
      if (running) return;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('A câmera precisa de um endereço HTTPS e de um navegador compatível.');
      await scanner.start({ facingMode: 'environment' }, {
        fps: 15, disableFlip: true,
        qrbox: (width, height) => ({ width: Math.floor(Math.min(width, height) * .78), height: Math.floor(Math.min(width, height) * .78) })
      }, onRead, () => {});
      running = true;
    },
    async stop() {
      try { if (scanner.isScanning) await scanner.stop(); }
      finally { running = false; }
    },
    async hasTorch() { return running && Boolean(scanner.getRunningTrackCameraCapabilities()?.torchFeature()?.isSupported()); },
    async setTorch(enabled) { await scanner.getRunningTrackCameraCapabilities().torchFeature().apply(enabled); }
  };
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';

interface BarcodeScannerProps {
  onScanSuccess: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScanSuccess, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();

    if (videoRef.current) {
      codeReader
        .decodeFromVideoDevice(null, videoRef.current, (result) => {
          if (result) {
            onScanSuccess(result.getText());
            codeReader.reset();
          }
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg('Kamera başlatılamadı. Lütfen kamera izinlerini kontrol edin.');
        });
    }

    return () => {
      codeReader.reset();
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 text-center relative shadow-2xl border border-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full font-bold text-slate-600 transition"
        >
          ✕
        </button>

        <h3 className="text-lg font-black text-slate-900">📷 Scanare Cod de Bare</h3>
        <p className="text-xs text-slate-500">Îndreptați camera către codul de bare de pe produs</p>

        {errorMsg ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold">{errorMsg}</div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-[#729FAD] h-64 flex items-center justify-center shadow-inner">
            <video ref={videoRef} className="w-full h-full object-cover" />
            <div className="absolute inset-x-4 h-0.5 bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,1)]" />
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 transition"
        >
          Închide Camera
        </button>
      </div>
    </div>
  );
}
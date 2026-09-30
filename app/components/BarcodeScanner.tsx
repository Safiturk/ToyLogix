"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { startBarcodeCamera } from "@/lib/barcode-camera";

interface BarcodeScannerProps {
  onScanSuccess: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({
  onScanSuccess,
  onClose,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const handleSuccess = useEffectEvent(onScanSuccess);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const codeReader = new BrowserMultiFormatReader();
    const stopCamera = startBarcodeCamera(video, codeReader, handleSuccess, () => {
      setErrorMsg("Kamera görüntüsü okunamadı. Lütfen kamera izinlerini kontrol edip tekrar deneyin.");
    });
    stopRef.current = stopCamera;

    return () => {
      stopCamera();
      stopRef.current = () => undefined;
    };
  }, []);

  const closeScanner = () => {
    stopRef.current();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 text-center relative shadow-2xl border border-slate-100">
        <button
          onClick={closeScanner}
          className="absolute top-4 right-4 w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full font-bold text-slate-600 transition"
        >
          ✕
        </button>

        <h3 className="text-lg font-black text-slate-900">
          📷 Scanare Cod de Bare
        </h3>
        <p className="text-xs text-slate-500">
          Îndreptați camera către codul de bare de pe produs
        </p>

        {errorMsg ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold">
            {errorMsg}
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-[#729FAD] h-64 flex items-center justify-center shadow-inner">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-x-4 h-0.5 bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,1)]" />
          </div>
        )}

        <button
          onClick={closeScanner}
          className="w-full py-2.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 transition"
        >
          Închide Camera
        </button>
      </div>
    </div>
  );
}

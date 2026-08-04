'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface Product {
  id: number;
  cod_bara: string;
  nume_produs: string;
  categorie: string;
  descriere: string;
  pret_engros: number;
  pret_retail: number;
  bucati_per_cutie: number;
  stoc_actual: number;
  stoc_critic: number;
  imagini: string[];
}

export default function StorePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerControlsRef = useRef<any>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Toate');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  // Focus & Kamera Modları
  const [focusedProduct, setFocusedProduct] = useState<Product | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  // KANITLANMIŞ KESİN KAMERA KAPATMA FONKSİYONU
  const stopCamera = () => {
    if (readerControlsRef.current) {
      try {
        readerControlsRef.current.stop();
      } catch (e) {
        console.error(e);
      }
      readerControlsRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    setShowCamera(false);
  };

  // KAMERAYI BAŞLATMA
  const startCamera = () => {
    setShowCamera(true);
    
    setTimeout(async () => {
      if (videoRef.current) {
        try {
          const codeReader = new BrowserMultiFormatReader();

          const controls = await codeReader.decodeFromVideoDevice(
            undefined,
            videoRef.current,
            (result) => {
              if (result) {
                const barcode = result.getText().trim();
                const found = products.find((p) => p.cod_bara?.trim() === barcode);
                
                stopCamera();

                if (found) {
                  setFocusedProduct(found);
                } else {
                  alert(`Produsul cu codul de bare ${barcode} nu a fost găsit!`);
                }
              }
            }
          );

          readerControlsRef.current = controls;
        } catch (err) {
          console.error("Camera error:", err);
        }
      }
    }, 250);
  };

  // Supabase'den Verileri Çek
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('produse')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const formattedData = data.map((p: any) => ({
        ...p,
        imagini: Array.isArray(p.imagini)
          ? p.imagini
          : typeof p.imagini === 'string' && p.imagini.startsWith('[')
          ? JSON.parse(p.imagini)
          : p.imagini
          ? [p.imagini]
          : [],
      }));

      setProducts(formattedData as Product[]);
      setFilteredProducts(formattedData as Product[]);
    }
    setLoading(false);
  };

  // Arama ve Kategori Filtresi
  useEffect(() => {
    let result = products;

    if (selectedCategory !== 'Toate') {
      result = result.filter((p) => p.categorie === selectedCategory);
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.nume_produs?.toLowerCase().includes(q) ||
          p.cod_bara?.toLowerCase().includes(q) ||
          p.categorie?.toLowerCase().includes(q)
      );
    }

    setFilteredProducts(result);
  }, [searchQuery, selectedCategory, products]);

  const categories = ['Toate', ...Array.from(new Set(products.map((p) => p.categorie)))];

  return (
    <div className="min-h-screen bg-slate-200/60 pb-12 font-sans relative">
      
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-5">
            {/* MODERN & ANİMASYONLU CATEGORII BUTONU */}
            <div className="relative">
              <button
                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                className="group relative flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-xs rounded-2xl transition-all duration-300 shadow-md hover:shadow-indigo-500/25 active:scale-95 border border-indigo-400/30"
              >
                <div className="w-6 h-6 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center transition-transform group-hover:rotate-12">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </div>

                <div className="flex flex-col items-start leading-none">
                  <span className="text-[9px] text-indigo-200 font-bold uppercase tracking-wider">Categorii</span>
                  <span className="text-xs font-black tracking-tight mt-0.5">{selectedCategory}</span>
                </div>

                <svg
                  className={`w-4 h-4 ml-1 text-indigo-200 transition-transform duration-300 ${
                    showCategoryMenu ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* MODERN DROPDOWN MENÜ */}
              {showCategoryMenu && (
                <div className="absolute top-full left-0 mt-3 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-100 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200 divide-y divide-slate-100/80">
                  <div className="px-4 py-2 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Selectează Categoria
                  </div>

                  <div className="py-1 max-h-64 overflow-y-auto">
                    {categories.map((cat) => {
                      const isSelected = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setShowCategoryMenu(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-all duration-150 flex items-center justify-between group ${
                            isSelected
                              ? 'bg-indigo-50 text-indigo-600 font-extrabold'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-indigo-600'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${
                              isSelected ? 'bg-indigo-600' : 'bg-slate-300'
                            }`} />
                            {cat}
                          </span>
                          
                          {isSelected && (
                            <span className="text-xs bg-indigo-100 text-indigo-600 font-extrabold px-2 py-0.5 rounded-full">
                              Activ
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-md">
                T
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-lg text-slate-800 tracking-tight">ToyLogix</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded-md">B2B</span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium -mt-1">Distribuție Oficială & En-Gros</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200/60 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Mehmet Safi Turk</span>
            </div>

            <button
              onClick={() => { stopCamera(); router.push('/admin'); }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95"
            >
              🔒 Admin Panel
            </button>

            <button
              onClick={() => { stopCamera(); router.push('/login'); }}
              className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl transition"
            >
              Ieșire
            </button>
          </div>

        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

        {/* BANNER */}
        <div className="relative w-full h-52 sm:h-60 rounded-3xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 p-6 sm:p-10 text-white shadow-xl overflow-hidden flex flex-col justify-center select-none">
          <div className="relative z-10 space-y-2">
            <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-extrabold uppercase tracking-wider">
              🏷️ OFERTĂ EN-GROS
            </span>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight line-clamp-1">
              Prețuri Directe de Producător
            </h1>
            <p className="text-xs sm:text-sm text-white/80 font-medium max-w-lg line-clamp-2">
              Profitați de marje excelente de profit pentru afacerea dvs. Colecții noi de jucării 2026.
            </p>
          </div>
        </div>

        {/* ARAMA VE KAMERA SCAN */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Căutare după nume, brand, cod bare..."
              className="w-full pl-4 pr-24 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 transition"
            />
            <button
              onClick={startCamera}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg transition flex items-center gap-1 shadow-sm"
            >
              📷 Scan
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>CATEGORIE SELECTATĂ:</span>
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
              🏷️ {selectedCategory}
            </span>
          </div>
        </div>

        {/* KAMERA SCAN POP-UP */}
        {showCamera && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-md w-full relative flex flex-col items-center">
              <button
                onClick={stopCamera}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg p-2"
              >
                ✕
              </button>
              <h3 className="text-sm font-bold text-slate-800 mb-4">Scanați codul de bare cu camera</h3>
              <video ref={videoRef} className="w-full h-64 object-cover rounded-2xl border bg-black" />
            </div>
          </div>
        )}

        {/* ÜRÜN LİSTESİ */}
        {loading ? (
          <div className="bg-white p-12 rounded-3xl text-center text-xs text-slate-400 font-bold shadow-sm">
            Se încarcă produsele magazinului...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl text-center space-y-3 shadow-sm border border-slate-200/80">
            <div className="text-4xl">📦</div>
            <h3 className="text-base font-black text-slate-800">Nu s-au găsit produse</h3>
            <p className="text-xs text-slate-400 font-medium">Încercați să schimbați cuvintele cheie sau filtrele selectate.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => setFocusedProduct(p)}
                className="bg-white rounded-3xl p-4 shadow-sm hover:shadow-md border border-slate-200/70 transition flex flex-col justify-between group cursor-pointer"
              >
                <div>
                  <div className="relative w-full h-48 rounded-2xl bg-slate-50 overflow-hidden mb-4 border border-slate-100 flex items-center justify-center p-2">
                    <span className="absolute top-2 left-2 z-10 px-2.5 py-1 bg-white/90 backdrop-blur-sm text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 shadow-sm">
                      {p.categorie}
                    </span>
                    
                    {p.imagini && p.imagini[0] ? (
                      <img src={p.imagini[0]} alt={p.nume_produs} className="w-full h-full object-contain group-hover:scale-105 transition duration-300" />
                    ) : (
                      <span className="text-xs font-bold text-slate-300">Fără Foto</span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-800 text-sm line-clamp-2 leading-snug">{p.nume_produs}</h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">Barcode: <span className="text-slate-600 font-mono">{p.cod_bara || '—'}</span></p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-end justify-between">
                  <div>
                    <span className="block text-[9px] font-black text-indigo-600 tracking-wider uppercase">PREȚ EN-GROS</span>
                    <span className="text-lg font-black text-slate-900">{p.pret_engros} <span className="text-xs font-bold text-slate-500">RON</span></span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setFocusedProduct(p); }} className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-xs rounded-xl transition active:scale-95">
                    Detalii
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

      {/* FOCUS MODU POP-UP */}
      {focusedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col md:flex-row relative">
            
            <button
              onClick={() => setFocusedProduct(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 font-bold rounded-full flex items-center justify-center transition"
            >
              ✕
            </button>

            <div className="w-full md:w-1/2 bg-slate-50 p-6 flex items-center justify-center border-b md:border-b-0 md:border-r border-slate-100">
              {focusedProduct.imagini && focusedProduct.imagini[0] ? (
                <img src={focusedProduct.imagini[0]} alt={focusedProduct.nume_produs} className="w-full h-64 object-contain rounded-2xl" />
              ) : (
                <div className="text-xs font-bold text-slate-400">Fără Foto</div>
              )}
            </div>

            <div className="w-full md:w-1/2 p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-lg border border-indigo-100 uppercase">
                  {focusedProduct.categorie}
                </span>
                <h2 className="text-xl font-black text-slate-900 leading-snug">{focusedProduct.nume_produs}</h2>
                <p className="text-xs font-mono text-slate-400">Barcode: {focusedProduct.cod_bara || '—'}</p>
                
                <p className="text-xs text-slate-600 line-clamp-3 pt-2">
                  {focusedProduct.descriere || "Nicio descriere suplimentară disponibilă pentru acest produs."}
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500">Stoc Actual:</span>
                  <span className="font-black text-slate-800">{focusedProduct.stoc_actual} buc</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500">Bucăți / Cutie:</span>
                  <span className="font-black text-slate-800">{focusedProduct.bucati_per_cutie || 1} buc</span>
                </div>
                <div className="flex justify-between items-center text-pt border-t border-slate-200 pt-2">
                  <span className="text-xs font-bold text-indigo-600">Preț En-Gros:</span>
                  <span className="text-lg font-black text-indigo-700">{focusedProduct.pret_engros} RON</span>
                </div>
              </div>

              <button
                onClick={() => setFocusedProduct(null)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition"
              >
                Închide / Înapoi la Listă
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import BarcodeScanner from '../components/BarcodeScanner';

interface Produs {
  id: number;
  cod_bara: string;
  nume_produs: string;
  categorie: string;
  brand: string;
  varsta_recomandata: string;
  gen: string;
  material: string;
  pret_retail: number;
  pret_engros: number;
  bucati_per_cutie: number;
  stoc_actual: number;
  imagini?: string[];
  descriere?: string;
}

export default function StorePage() {
  const [produse, setProduse] = useState<Produs[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Toate');

  // Sol Menü State
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [selectedProduct, setSelectedProduct] = useState<Produs | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const offers = [
    { id: 1, tag: '✨ B2B PREMIUM', title: 'Colecții Noi de Jucării 2026', desc: 'Calitate superioară și livrare rapidă direct din depozit.', bg: 'from-indigo-600 via-purple-600 to-pink-500' },
    { id: 2, tag: '🚀 OFERTĂ EN-GROS', title: 'Prețuri Directe de Producător', desc: 'Profitați de marje excelente de profit pentru afacerea dvs.', bg: 'from-blue-600 via-[#6366F1] to-emerald-500' },
  ];
  const [currentOffer, setCurrentOffer] = useState(0);

  useEffect(() => {
    const session = localStorage.getItem('user_session');
    if (session) {
      try {
        setCurrentUser(JSON.parse(session));
      } catch (e) {
        console.error(e);
      }
    }

    const timer = setInterval(() => {
      setCurrentOffer((prev) => (prev + 1) % offers.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [offers.length]);

  const fetchProduse = async () => {
    setLoading(true);
    // created_at hatasını önlemek için id'ye göre sıralıyoruz
    const { data, error } = await supabase
      .from('produse')
      .select('*')
      .order('id', { ascending: false });

    if (error) console.error('Eroare:', error);
    else setProduse(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProduse();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user_session');
    localStorage.removeItem('admin_authenticated');
    setCurrentUser(null);
    window.location.reload();
  };

  const categoriesMap = new Map<string, string>();
  produse.forEach((p) => {
    if (p.categorie && p.categorie.trim()) {
      const normalized = p.categorie.trim().toLowerCase();
      if (!categoriesMap.has(normalized)) {
        categoriesMap.set(normalized, p.categorie.trim());
      }
    }
  });
  const categories = ['Toate', ...Array.from(categoriesMap.values())];

  const filteredProduse = produse.filter((p) => {
    const matchesSearch =
      p.nume_produs.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.cod_bara.includes(searchQuery);

    const matchesCategory =
      selectedCategory === 'Toate' ||
      (p.categorie && p.categorie.trim().toLowerCase() === selectedCategory.trim().toLowerCase());

    return matchesSearch && matchesCategory;
  });

  const isB2BUser = currentUser && (currentUser.rol === 'admin' || currentUser.nume_firma);

  const getCategoryIcon = (categoryName: string) => {
    const cat = categoryName.toLowerCase();
    if (cat === 'toate') return '🏷️';
    if (cat.includes('masin') || cat.includes('car')) return '🏎️';
    if (cat.includes('carti') || cat.includes('book')) return '📚';
    if (cat.includes('bebelusi') || cat.includes('baby')) return '👶';
    if (cat.includes('papus') || cat.includes('doll')) return '🧸';
    if (cat.includes('puzzle')) return '🧩';
    if (cat.includes('joc')) return '🎲';
    return '🎁';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50/30 to-purple-50/20 text-slate-900 font-sans relative overflow-x-hidden">
      
      {/* HEADER / NAVBAR */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-indigo-100/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex justify-between items-center gap-4">
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCategoryMenuOpen(true)}
              className="p-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl transition-all flex items-center gap-2 border border-indigo-200/80 active:scale-95 shadow-sm"
              title="Deschide Categorii"
            >
              <span className="text-lg">☰</span>
              <span className="text-xs font-black hidden sm:inline">Categorii</span>
            </button>

            <Link href="/store" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
                T
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                  ToyLogix <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">B2B</span>
                </h1>
                <p className="text-[10px] text-slate-500 font-medium hidden sm:block">Distribuție Oficială & En-Gros</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {currentUser.nume_complet}
                </div>

                {currentUser.rol === 'admin' && (
                  <Link
                    href="/admin"
                    className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/25 transition-all"
                  >
                    🔒 Admin Panel
                  </Link>
                )}

                <button
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold border border-rose-200/60 transition-all"
                >
                  Ieșire
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 transition-all"
                >
                  Autentificare
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-all shadow-sm"
                >
                  Înregistrare
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* SOL KATEGORİ MENÜSÜ */}
      {isCategoryMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            onClick={() => setIsCategoryMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-fadeIn"
          />

          <div className="relative w-80 max-w-[85vw] bg-white h-full shadow-2xl z-10 flex flex-col p-6 space-y-6 border-r border-indigo-100 animate-slideRight">
            
            <div className="flex justify-between items-center border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base">
                  📁
                </div>
                <h3 className="text-lg font-black text-slate-900">Categorii Produse</h3>
              </div>
              <button
                onClick={() => setIsCategoryMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {categories.map((cat) => {
                const isSelected = selectedCategory.trim().toLowerCase() === cat.trim().toLowerCase();

                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setIsCategoryMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs font-bold transition-all duration-200 ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30 scale-[1.02]'
                        : 'bg-slate-50 hover:bg-indigo-50/70 text-slate-700 hover:text-indigo-600 hover:translate-x-1'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">{getCategoryIcon(cat)}</span>
                      <span className="capitalize text-sm font-black">{cat}</span>
                    </div>

                    <span className={`text-base font-bold transition-transform ${isSelected ? 'translate-x-0' : 'opacity-40'}`}>
                      ›
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 font-medium text-center">
              ToyLogix B2B Catalog System
            </div>
          </div>
        </div>
      )}

      {/* HERO BANNER SLIDER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <div className={`relative rounded-3xl p-8 sm:p-10 text-white bg-gradient-to-r ${offers[currentOffer].bg} shadow-2xl overflow-hidden transition-all duration-700`}>
          <div className="absolute -right-12 -bottom-12 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="max-w-xl space-y-3 relative z-10">
            <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-extrabold uppercase tracking-widest text-white">
              {offers[currentOffer].tag}
            </span>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
              {offers[currentOffer].title}
            </h2>
            <p className="text-xs sm:text-sm text-white/90 font-medium">
              {offers[currentOffer].desc}
            </p>
          </div>

          <div className="absolute bottom-6 right-8 flex gap-2 z-10">
            {offers.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentOffer(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  currentOffer === idx ? 'bg-white w-8' : 'bg-white/40 w-2 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* MAIN İÇERİK */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        <div className="p-4 sm:p-5 rounded-2xl bg-white/90 backdrop-blur-xl border border-indigo-100/80 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
          
          <div className="w-full sm:w-96 flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Căutare după nume, brand, cod bare..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            
            <button
              onClick={() => setShowScanner(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 active:scale-95"
            >
              📷 Scan
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Categorie Selectată:</span>
            <span className="px-4 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5">
              <span>{getCategoryIcon(selectedCategory)}</span>
              <span>{selectedCategory}</span>
            </span>
            {selectedCategory !== 'Toate' && (
              <button
                onClick={() => setSelectedCategory('Toate')}
                className="text-xs font-bold text-slate-400 hover:text-indigo-600 underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ÜRÜN GRID */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-80 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : filteredProduse.length === 0 ? (
          <div className="p-16 rounded-3xl bg-white border border-slate-200 text-center space-y-3 shadow-sm">
            <div className="text-4xl">📦</div>
            <h3 className="text-lg font-bold text-slate-700">Nu s-au găsit produse</h3>
            <p className="text-xs text-slate-400">Încercați să schimbați cuvintele cheie sau filtrele selectate.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProduse.map((produs) => (
              <ProductCard
                key={produs.id}
                produs={produs}
                isB2B={isB2BUser}
                onClick={() => {
                  setSelectedProduct(produs);
                  setSelectedImageIndex(0);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* DETAY SAYFASI MODALI */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 md:p-10 flex items-center justify-center">
          <div className="bg-white border border-slate-100 rounded-3xl max-w-4xl w-full p-6 sm:p-8 relative shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-6 right-6 w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center font-bold text-sm transition"
            >
              ✕
            </button>

            <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
              <span>Jucării</span> / <span>{selectedProduct.categorie || 'General'}</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              {selectedProduct.nume_produs}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-6 space-y-3">
                <div className="relative h-72 sm:h-80 bg-slate-50 border border-slate-200/80 rounded-2xl overflow-hidden flex items-center justify-center">
                  <img
                    src={
                      selectedProduct.imagini && selectedProduct.imagini.length > 0
                        ? selectedProduct.imagini[selectedImageIndex]
                        : 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=500&q=80'
                    }
                    alt={selectedProduct.nume_produs}
                    className="w-full h-full object-contain p-4"
                  />
                </div>
              </div>

              <div className="lg:col-span-6 space-y-6">
                <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/50 p-5 rounded-2xl border border-indigo-100 space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-900">Preț En-Gros (B2B):</span>
                    <div className="text-3xl font-black text-indigo-600">
                      {selectedProduct.pret_engros} <span className="text-xs font-bold text-slate-400">RON</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-indigo-100">
                    <span className="text-slate-500 font-medium">Preț Recomandat Vânzare (RRP):</span>
                    <span className="font-bold text-slate-800">{selectedProduct.pret_retail} RON</span>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-indigo-100">
                    <span className="text-slate-500 font-medium">Ambalare:</span>
                    <span className="font-bold text-indigo-700">{selectedProduct.bucati_per_cutie} buc / cutie</span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-600">
                  <p><strong className="text-slate-800">Cod Bare:</strong> {selectedProduct.cod_bara}</p>
                  <p><strong className="text-slate-800">Brand:</strong> {selectedProduct.brand || 'Nespecificat'}</p>
                  <p><strong className="text-slate-800">Vârstă recomandată:</strong> {selectedProduct.varsta_recomandata}</p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Descriere Produs</h4>
                  <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                    {selectedProduct.descriere || 'Jucărie de înaltă calitate disponibilă în stocul nostru.'}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onScanSuccess={(scannedCode: string) => {
            setSearchQuery(scannedCode);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

function ProductCard({
  produs,
  isB2B,
  onClick,
}: {
  produs: Produs;
  isB2B: boolean;
  onClick: () => void;
}) {
  const images = produs.imagini && produs.imagini.length > 0 ? produs.imagini : ['https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=500&q=80'];

  return (
    <div
      onClick={onClick}
      className="group bg-white hover:bg-slate-50/80 border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-4 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 flex flex-col justify-between cursor-pointer relative overflow-hidden"
    >
      <div className="space-y-3">
        <div className="relative h-48 w-full bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center border border-slate-100">
          <img
            src={images[0]}
            alt={produs.nume_produs}
            className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
          />

          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 bg-white/95 backdrop-blur-md text-[10px] font-bold text-indigo-700 rounded-lg border border-indigo-100 shadow-sm">
            {produs.categorie || 'General'}
          </span>
        </div>

        <div className="space-y-1">
          <h3 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
            {produs.nume_produs}
          </h3>
          <p className="text-[11px] text-slate-400 font-medium">Brand: {produs.brand || 'Nespecificat'}</p>
        </div>
      </div>

      <div className="pt-4 mt-3 border-t border-slate-100 flex justify-between items-end">
        <div>
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-600 block">Preț En-Gros</span>
          <div className="text-lg font-black text-indigo-600">
            {produs.pret_engros} <span className="text-xs font-bold text-slate-400">RON</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">RRP: {produs.pret_retail} RON</span>
        </div>

        <span className="px-3.5 py-1.5 bg-indigo-50 group-hover:bg-indigo-600 text-indigo-700 group-hover:text-white rounded-xl text-xs font-bold transition-all shadow-sm">
          Detalii
        </span>
      </div>
    </div>
  );
}
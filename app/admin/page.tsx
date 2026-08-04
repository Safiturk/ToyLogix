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

interface AppUser {
  id: string;
  nume: string;
  email: string;
  telefon: string;
  firma: string;
  rol: 'ADMIN' | 'USER';
}

export default function AdminPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerControlsRef = useRef<any>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  // Kayıtlı Kullanıcılar Tablosu State'leri ve Açılır/Kapanır Modu
  const [showUsersSection, setShowUsersSection] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([
    {
      id: '1',
      nume: 'Mehmet Safi Turk',
      email: 'romehmetsafi@gmail.com',
      telefon: '0774620997',
      firma: 'SAFIRO',
      rol: 'ADMIN',
    },
    {
      id: '2',
      nume: 'Eminescu Mihai',
      email: 'srkzeem@gmail.com',
      telefon: '0753249250',
      firma: 'SRKZEEM TOY',
      rol: 'USER',
    },
    {
      id: '3',
      nume: 'System Admin',
      email: 'admin@toylogix.com',
      telefon: '0700000000',
      firma: 'Client Direct',
      rol: 'USER',
    },
  ]);

  // Form State'leri
  const [codBara, setCodBara] = useState('');
  const [numeProdus, setNumeProdus] = useState('');
  const [categorie, setCategorie] = useState('');
  const [descriere, setDescriere] = useState('');
  const [pretEngros, setPretEngros] = useState('');
  const [pretRetail, setPretRetail] = useState('');
  const [bucatiPerCutie, setBucatiPerCutie] = useState('1');
  const [stocActual, setStocActual] = useState('0');
  const [stocCritic, setStocCritic] = useState('10');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchUsers();
  }, []);

  // Supabase'den kullanıcıları çekme (TypeScript Tip Düzeltmesi Yapıldı)
  const fetchUsers = async () => {
    const { data, error } = await supabase.from('profiluri').select('*');
    if (!error && data && data.length > 0) {
      const formattedUsers: AppUser[] = data.map((u: any) => ({
        id: u.id,
        nume: u.nume_complet || u.nume || 'Utilizator',
        email: u.email || '—',
        telefon: u.telefon || '—',
        firma: u.nume_firma || u.firma || 'Client Direct',
        rol: (u.rol === 'admin' || u.rol === 'ADMIN' ? 'ADMIN' : 'USER') as 'ADMIN' | 'USER',
      }));
      setUsers(formattedUsers);
    }
  };

  // Kullanıcı Rolünü Değiştirme
  const toggleUserRole = async (userId: string, currentRole: 'ADMIN' | 'USER') => {
    const newRole: 'ADMIN' | 'USER' = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, rol: newRole } : u))
    );
    await supabase.from('profiluri').update({ rol: newRole.toLowerCase() }).eq('id', userId);
  };

  // Kullanıcıyı Silme
  const deleteUser = async (userId: string) => {
    if (confirm('Sigur doriți să ștergeți acest utilizator?')) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      await supabase.from('profiluri').delete().eq('id', userId);
    }
  };

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
                stopCamera();
                handleScannedBarcode(barcode);
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

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('produse')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const formatted = data.map((p: any) => ({
        ...p,
        imagini: Array.isArray(p.imagini)
          ? p.imagini
          : typeof p.imagini === 'string' && p.imagini.startsWith('[')
          ? JSON.parse(p.imagini)
          : p.imagini
          ? [p.imagini]
          : [],
      }));
      setProducts(formatted as Product[]);
    }
    setLoading(false);
  };

  const handleScannedBarcode = (barcode: string) => {
    const cleanBarcode = barcode.trim();
    const found = products.find((p) => p.cod_bara?.trim() === cleanBarcode);

    if (found) {
      startEditing(found);
    } else {
      alert(`Produsul cu codul ${cleanBarcode} nu există în baza de date!`);
      clearForm();
      setCodBara(cleanBarcode);
    }
  };

  const startEditing = (product: Product) => {
    setEditingProduct(product);
    setCodBara(product.cod_bara || '');
    setNumeProdus(product.nume_produs || '');
    setCategorie(product.categorie || '');
    setDescriere(product.descriere || '');
    setPretEngros(product.pret_engros?.toString() || '');
    setPretRetail(product.pret_retail?.toString() || '');
    setBucatiPerCutie(product.bucati_per_cutie?.toString() || '1');
    setStocActual(product.stoc_actual?.toString() || '0');
    setStocCritic(product.stoc_critic?.toString() || '10');
    setImageUrl(product.imagini && product.imagini[0] ? product.imagini[0] : '');
  };

  const clearForm = () => {
    setEditingProduct(null);
    setCodBara('');
    setNumeProdus('');
    setCategorie('');
    setDescriere('');
    setPretEngros('');
    setPretRrp('');
    setPretRetail('');
    setBucatiPerCutie('1');
    setStocActual('0');
    setStocCritic('10');
    setImageUrl('');
  };

  const setPretRrp = (val: string) => {
    setPretRetail(val);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      cod_bara: codBara,
      nume_produs: numeProdus,
      categorie: categorie,
      descriere: descriere,
      pret_engros: parseFloat(pretEngros) || 0,
      pret_retail: parseFloat(pretRetail) || 0,
      bucati_per_cutie: parseInt(bucatiPerCutie) || 1,
      stoc_actual: parseInt(stocActual) || 0,
      stoc_critic: parseInt(stocCritic) || 10,
      imagini: imageUrl ? [imageUrl] : [],
    };

    if (editingProduct) {
      const { error } = await supabase.from('produse').update(payload).eq('id', editingProduct.id);
      if (!error) {
        alert('Produs actualizat cu succes!');
        clearForm();
        fetchProducts();
      } else {
        alert('Eroare: ' + error.message);
      }
    } else {
      const { error } = await supabase.from('produse').insert([payload]);
      if (!error) {
        alert('Produs adăugat cu succes!');
        clearForm();
        fetchProducts();
      } else {
        alert('Eroare: ' + error.message);
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Sigur doriți să ștergeți acest produs?')) {
      const { error } = await supabase.from('produse').delete().eq('id', id);
      if (!error) fetchProducts();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Admin Dashboard - Depozit</h1>
            <p className="text-xs text-slate-400 font-medium">Gestionare produse, stocuri și scanare barkod</p>
          </div>
          <button
            onClick={() => { stopCamera(); router.push('/store'); }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition"
          >
            ← Înapoi la Magazin
          </button>
        </div>

        {/* UTILIZATORI ÎNREGISTRAȚI */}
        <div className="bg-slate-200/80 p-6 rounded-3xl shadow-sm border border-slate-300/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-indigo-900 text-lg">👥</span>
              <h2 className="text-lg font-black text-slate-900">Utilizatori Înregistrați</h2>
              <span className="ml-1 px-2.5 py-0.5 bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-full">
                {users.length}
              </span>
            </div>

            <button
              onClick={() => setShowUsersSection(!showUsersSection)}
              className="w-8 h-8 bg-white text-slate-700 rounded-full flex items-center justify-center font-bold shadow-sm hover:bg-slate-50 transition"
            >
              {showUsersSection ? '▲' : '▼'}
            </button>
          </div>

          {showUsersSection && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-extrabold text-[11px]">
                      <th className="p-4">Nume & Prenume</th>
                      <th className="p-4">Contact</th>
                      <th className="p-4">Firma</th>
                      <th className="p-4">Rol</th>
                      <th className="p-4 text-right">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4 font-black text-slate-900">{u.nume}</td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{u.email}</div>
                          <div className="text-[10px] text-slate-400 font-semibold">{u.telefon}</div>
                        </td>
                        <td className="p-4 font-bold text-slate-600">{u.firma}</td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                              u.rol === 'ADMIN'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-600'
                            }`}
                          >
                            {u.rol}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => toggleUserRole(u.id, u.rol)}
                            disabled={u.rol === 'ADMIN' && u.nume.includes('Mehmet')}
                            className={`px-3 py-1.5 font-bold text-[11px] rounded-full transition shadow-sm ${
                              u.rol === 'ADMIN' && u.nume.includes('Mehmet')
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {u.rol === 'ADMIN' ? 'Schimbă în User' : 'Schimbă în Admin'}
                          </button>

                          <button
                            onClick={() => deleteUser(u.id)}
                            disabled={u.rol === 'ADMIN' && u.nume.includes('Mehmet')}
                            className={`px-3 py-1.5 font-bold text-[11px] rounded-full transition shadow-sm ${
                              u.rol === 'ADMIN' && u.nume.includes('Mehmet')
                                ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                : 'bg-rose-100 hover:bg-rose-200 text-rose-600'
                            }`}
                          >
                            Șterge ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* BARKOD SCANNER BAR */}
        <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-[10px] bg-indigo-500/30 text-indigo-200 font-bold px-2.5 py-1 rounded-md uppercase">
              📷 Scan & Edit
            </span>
            <h3 className="text-lg font-bold mt-1">Scanați codul de bare pentru EDITARE</h3>
            <p className="text-xs text-slate-300">Deschideți camera pentru a edita automat produsul scanat.</p>
          </div>

          <button
            onClick={() => (showCamera ? stopCamera() : startCamera())}
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold text-xs rounded-xl shadow-lg transition active:scale-95 flex items-center gap-2"
          >
            📷 {showCamera ? 'Închide Scan' : 'Scan'}
          </button>
        </div>

        {/* KAMERA MODAL */}
        {showCamera && (
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 flex flex-col items-center relative">
            <button
              onClick={stopCamera}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg p-2"
            >
              ✕
            </button>
            <h4 className="text-sm font-bold text-slate-800 mb-2">Apropiați codul de bare de cameră</h4>
            <video ref={videoRef} className="w-full max-w-md rounded-xl border bg-black h-64 object-cover" />
          </div>
        )}

        {/* FORM */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-black text-slate-800">
              {editingProduct ? '✏️ Editează Produs' : '➕ Adaugă Produs Nou'}
            </h2>
            {editingProduct && (
              <button onClick={clearForm} className="text-xs font-bold text-rose-600 hover:underline">
                Anulează Editarea
              </button>
            )}
          </div>

          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Cod Bare (Barcode)</label>
              <input type="text" value={codBara} onChange={(e) => setCodBara(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Nume Produs</label>
              <input type="text" value={numeProdus} onChange={(e) => setNumeProdus(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Categorie</label>
              <input type="text" value={categorie} onChange={(e) => setCategorie(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Preț En-Gros (RON)</label>
              <input type="number" step="0.01" value={pretEngros} onChange={(e) => setPretEngros(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Preț Retail (RRP)</label>
              <input type="number" step="0.01" value={pretRetail} onChange={(e) => setPretRetail(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Bucăți / Cutie</label>
              <input type="number" value={bucatiPerCutie} onChange={(e) => setBucatiPerCutie(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Stoc Actual</label>
              <input type="number" value={stocActual} onChange={(e) => setStocActual(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Stoc Critic</label>
              <input type="number" value={stocCritic} onChange={(e) => setStocCritic(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">URL Imagine</label>
              <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">Descriere</label>
              <textarea value={descriere} onChange={(e) => setDescriere(e.target.value)} rows={2} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-indigo-600" />
            </div>

            <div className="md:col-span-3 flex justify-end gap-3 pt-2">
              <button type="submit" className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition">
                {editingProduct ? '💾 Salvează Modificările' : '➕ Adaugă Produsul'}
              </button>
            </div>
          </form>
        </div>

        {/* TABLO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-base font-black text-slate-800 mb-4">Lista Produse în Depozit</h2>
          {loading ? (
            <div className="text-center py-8 text-xs text-slate-400 font-bold">Se încarcă produsele...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b text-slate-400 font-extrabold uppercase text-[10px]">
                    <th className="p-3">Imagine</th>
                    <th className="p-3">Cod Bare</th>
                    <th className="p-3">Nume</th>
                    <th className="p-3">Categorie</th>
                    <th className="p-3">Preț En-Gros</th>
                    <th className="p-3">Stoc / Critic</th>
                    <th className="p-3 text-right">Acțiuni</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-semibold text-slate-700">
                  {products.map((p) => {
                    const isCritical = p.stoc_actual <= (p.stoc_critic || 10);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition">
                        <td className="p-3">
                          {p.imagini && p.imagini[0] ? (
                            <img src={p.imagini[0]} alt={p.nume_produs} className="w-10 h-10 object-contain rounded border bg-white" />
                          ) : (
                            <span className="text-[10px] text-slate-300">Fără Foto</span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800">{p.cod_bara || '—'}</td>
                        <td className="p-3 font-bold text-slate-900">{p.nume_produs}</td>
                        <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold">{p.categorie}</span></td>
                        <td className="p-3 font-bold text-indigo-600">{p.pret_engros} RON</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded font-bold text-[10px] ${isCritical ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {p.stoc_actual} buc (Limită: {p.stoc_critic || 10})
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button onClick={() => startEditing(p)} className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold rounded-lg transition">
                            ✏️ Editează
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white font-bold rounded-lg transition">
                            🗑️ Șterge
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
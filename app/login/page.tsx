'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase
      .from('utilizatori')
      .select('*')
      .eq('email', email.trim())
      .eq('telefon', telefon.trim())
      .single();

    if (error || !data) {
      alert('Email sau număr de telefon incorect!');
      setLoading(false);
      return;
    }

    if (data.status === 'pending') {
      alert('Contul dumneavoastră este în curs de verificare de către administrator.');
      setLoading(false);
      return;
    }

    if (data.status === 'rejected') {
      alert('Contul dumneavoastră a fost respins.');
      setLoading(false);
      return;
    }

    localStorage.setItem('user_session', JSON.stringify(data));
    if (data.rol === 'admin') {
      localStorage.setItem('admin_authenticated', 'true');
      router.push('/admin');
    } else {
      router.push('/store');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/50 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-xl border border-slate-200 p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-6">
        
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#729FAD] text-white font-black text-2xl flex items-center justify-center mx-auto shadow-lg shadow-[#729FAD]/30">
            T
          </div>
          <h2 className="text-2xl font-black text-slate-800">Autentificare B2B</h2>
          <p className="text-xs text-slate-500 font-medium">Introduceți datele contului dumneavoastră</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Adresă Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nume@firma.com"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#729FAD] focus:ring-2 focus:ring-[#729FAD]/20 transition shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Număr de Telefon</label>
            <input
              type="text"
              required
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              placeholder="07xxxxxxxx"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#729FAD] focus:ring-2 focus:ring-[#729FAD]/20 transition font-mono shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#729FAD] hover:bg-[#5B8594] text-white font-bold rounded-xl text-xs shadow-lg shadow-[#729FAD]/25 transition active:scale-95"
          >
            {loading ? 'Se procesează...' : 'Intră în Cont'}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Nu aveți cont de partener?{' '}
            <Link href="/register" className="font-bold text-[#729FAD] hover:underline">
              Înregistrați-vă aici
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
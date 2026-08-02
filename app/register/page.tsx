'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [numeComplet, setNumeComplet] = useState('');
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [parola, setParola] = useState('');
  const [numeFirma, setNumeFirma] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 1. Veritabanına kullanıcıyı ekle
    const { error } = await supabase.from('utilizatori').insert([
      {
        nume_complet: numeComplet.trim(),
        email: email.trim(),
        telefon: telefon.trim(),
        parola: parola.trim(),
        nume_firma: numeFirma.trim() || null,
        status: 'pending',
        rol: 'user',
      },
    ]);

    if (error) {
      alert('Eroare la înregistrare: ' + error.message);
      setLoading(false);
      return;
    }

    // 2. Admin'e Bildirim Maili Gönder (Formspree Entegrasyonu)
    try {
      await fetch('https://formspree.io/f/mwvggppn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: '🔔 Nouă Înregistrare Partener ToyLogix B2B',
          admin_message: 'S-a înregistrat un nou utilizator pe platforma B2B!',
          nume_complet: numeComplet,
          email: email,
          telefon: telefon,
          firma: numeFirma || 'Client Direct (Fără Firmă)',
        }),
      });
    } catch (err) {
      console.log('Formspree notification error:', err);
    }

    alert('Solicitarea a fost trimisă cu succes! Contul dvs. este în curs de verificare.');
    router.push('/login');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50/30 to-purple-50/20 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-xl border border-slate-200 p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-6">
        
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/30">
            T
          </div>
          <h2 className="text-2xl font-black text-slate-800">Înregistrare Partener B2B</h2>
          <p className="text-xs text-slate-500 font-medium">Completați datele pentru a solicita un cont</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nume și Prenume</label>
            <input
              type="text"
              required
              value={numeComplet}
              onChange={(e) => setNumeComplet(e.target.value)}
              placeholder="Nume Prenume"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Adresă Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nume@firma.com"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition shadow-sm"
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
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition font-mono shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Parolă (Şifre)</label>
            <input
              type="password"
              required
              value={parola}
              onChange={(e) => setParola(e.target.value)}
              placeholder="••••••••"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nume Firmă (Opțional / B2B)</label>
            <input
              type="text"
              value={numeFirma}
              onChange={(e) => setNumeFirma(e.target.value)}
              placeholder="SC Toy SRL"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/25 transition active:scale-95"
          >
            {loading ? 'Se trimite...' : 'Trimite Solicitarea'}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Aveți deja un cont?{' '}
            <Link href="/login" className="font-bold text-indigo-600 hover:underline">
              Autentificați-vă
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
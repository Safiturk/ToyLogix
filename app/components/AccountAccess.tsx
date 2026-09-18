"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import s from "./account-access.module.css";

type Mode = "login" | "forgot" | "update";

function PasswordField({ id, label, value, change, confirm = false, invalid = false }: {
  id: string; label: string; value: string; change: (value: string) => void; confirm?: boolean; invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <div className={s.field}>
    <label htmlFor={id}>{label}</label>
    <div className={s.password}>
      <input id={id} type={visible ? "text" : "password"} value={value} onChange={(event) => change(event.target.value)}
        required autoComplete={id === "login-password" ? "current-password" : "new-password"}
        aria-invalid={invalid} aria-describedby={invalid ? "password-mismatch" : id === "new-password" ? "password-help" : undefined}
        placeholder={confirm ? "Repetă parola nouă" : "Introdu parola"} />
      <button type="button" onClick={() => setVisible(!visible)} aria-controls={id} aria-pressed={visible}
        aria-label={`${visible ? "Ascunde" : "Arată"}: ${label}`}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  </div>;
}

export default function AccountAccess({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(mode !== "update");
  const mismatch = mode === "update" && submitted && confirmation !== password;

  useEffect(() => {
    if (mode !== "update") return;
    let active = true;
    // The Supabase browser client consumes recovery tokens from the email URL.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setSessionReady(Boolean(session)); setSessionChecked(true); }
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (active) { setSessionReady(!error && Boolean(data.session)); setSessionChecked(true); }
    }).catch(() => { if (active) { setSessionReady(false); setSessionChecked(true); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [mode]);

  useEffect(() => {
    if (!success || mode !== "update") return;
    const timer = setTimeout(() => router.replace("/login"), 2200);
    return () => clearTimeout(timer);
  }, [success, mode, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setError("");
    if (mode === "update") {
      if (password !== confirmation) { document.getElementById("confirm-password")?.focus(); return; }
      if (password.length < 8 || !/\p{Lu}/u.test(password) || !/[0-9]/.test(password) || !/[\p{P}\p{S}]/u.test(password)) {
        setError("Alege minimum 8 caractere, o literă mare, o cifră și un caracter special."); return;
      }
      if (!sessionReady) { setError("Linkul nu mai este valid. Solicită un link nou."); return; }
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/update-password` });
        if (error) { setError("Nu am putut trimite solicitarea. Încearcă din nou în câteva minute."); return; }
        setSuccess(true);
      } else if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          setError(error.code === "same_password" ? "Alege o parolă diferită de cea anterioară." : "Parola nu a putut fi actualizată. Verifică cerințele sau solicită un link nou."); return;
        }
        await supabase.auth.signOut({ scope: "local" });
        localStorage.removeItem("user_session");
        localStorage.removeItem("admin_authenticated");
        window.dispatchEvent(new Event("toylogix-session"));
        setPassword(""); setConfirmation(""); setSuccess(true);
      } else {
        const { data: auth, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error || !auth.user) { setError("Email sau parolă incorectă. Verifică și confirmarea adresei de email."); return; }
        // B2B approval remains a separate requirement from password authentication.
        const { data: profile, error: profileError } = await supabase.from("utilizatori")
          .select("id,nume_complet,email,rol,status")
          .eq("email", auth.user.email ?? email.trim()).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
        if (profileError || !profile || profile.status !== "approved") {
          await supabase.auth.signOut({ scope: "local" });
          localStorage.removeItem("user_session"); localStorage.removeItem("admin_authenticated");
          setError(profile?.status === "pending" ? "Contul este în curs de verificare. Vei putea intra după aprobare." : "Accesul la cont nu este disponibil. Contactează echipa ToyLogix."); return;
        }
        localStorage.setItem("user_session", JSON.stringify(profile));
        if (profile.rol === "admin") localStorage.setItem("admin_authenticated", "true");
        else localStorage.removeItem("admin_authenticated");
        window.dispatchEvent(new Event("toylogix-session"));
        router.replace(profile.rol === "admin" ? "/admin" : "/store");
      }
    } catch { setError("Conexiunea a fost întreruptă. Încearcă din nou."); }
    finally { setBusy(false); }
  }

  const title = mode === "login" ? "Bine ai revenit." : mode === "forgot" ? "Ai uitat parola?" : "O parolă nouă.";
  return <main className={s.page}>
    <header className={s.header}><Link className={s.logo} href="/store">ToyLogix<span>·</span><small>PARTNER PORTAL</small></Link><span>Jucării & distribuție B2B</span></header>
    <div className={s.layout}>
      <section className={s.story}>
        <span className={s.eyebrow}>UN PARTENERIAT. NOI POSIBILITĂȚI.</span>
        <h1>Mai multă joacă.<br /><em>Mai mult potențial.</em></h1>
        <p>Catalogul, prețurile en-gros și disponibilitatea produselor — într-un singur loc, pentru afacerea ta.</p>
        <div className={s.storyDetails}><span>01 / Descoperă colecțiile</span><span>02 / Pregătește următorul sezon</span></div>
        <div className={s.wordmark} aria-hidden="true">T<span>·</span></div>
      </section>
      <section className={s.card} aria-labelledby="access-title">
        <div className={s.cardTop}><span className={s.eyebrow}>CONTUL TĂU TOYLOGIX</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></div>
        <h2 id="access-title">{title}</h2>
        <p className={s.intro}>{mode === "login" ? "Intră în cont cu adresa de email și parola ta." : mode === "forgot" ? "Îți trimitem un link pentru a alege o parolă nouă." : "Alege o parolă pe care o folosești doar pentru acest cont."}</p>
        {success ? <div className={s.success} role="status"><span aria-hidden="true">✓</span><h3>{mode === "forgot" ? "Verifică emailul" : "Parola a fost actualizată"}</h3><p>{mode === "forgot" ? "Dacă există un cont eligibil pentru această adresă, vei primi un link de resetare. Verifică și folderul Spam." : "Te redirecționăm către autentificare. Folosește noua parolă."}</p><Link href="/login">Înapoi la autentificare →</Link></div>
          : mode === "update" && !sessionReady ? <div className={s.notice} role="status"><p>{sessionChecked ? "Linkul lipsește, a expirat sau a fost deja folosit." : "Verificăm linkul de resetare…"}</p>{sessionChecked && <Link href="/forgot-password">Solicită un link nou →</Link>}</div>
          : <form onSubmit={submit} className={s.form} aria-busy={busy}>
            {mode !== "update" && <div className={s.field}><label htmlFor="access-email">Adresă de email</label><input id="access-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nume@companie.ro" /></div>}
            {mode !== "forgot" && <PasswordField id={mode === "login" ? "login-password" : "new-password"} label={mode === "login" ? "Parolă" : "Parolă nouă"} value={password} change={setPassword} />}
            {mode === "login" && <Link className={s.forgot} href="/forgot-password">Ai uitat parola?</Link>}
            {mode === "update" && <><p id="password-help" className={s.help}>Minimum 8 caractere, o literă mare, o cifră și un caracter special.</p><PasswordField id="confirm-password" label="Confirmă parola nouă" value={confirmation} change={setConfirmation} confirm invalid={mismatch} />{mismatch && <p id="password-mismatch" className={s.error} role="alert">Parolele nu se potrivesc.</p>}</>}
            {error && <p className={s.error} role="alert">{error}</p>}
            <button className={s.submit} type="submit" disabled={busy}>{busy && <span className={s.spinner} aria-hidden="true" />}{busy ? "Se procesează…" : mode === "login" ? "Intră în cont" : mode === "forgot" ? "Trimite linkul de resetare" : "Salvează parola nouă"}{!busy && <span aria-hidden="true">→</span>}</button>
          </form>}
        <div className={s.cardFooter}>{mode === "login" ? <>Nu ai încă un cont? <Link href="/register">Devino partener</Link></> : <Link href="/login">← Înapoi la autentificare</Link>}</div>
      </section>
    </div>
    <footer className={s.footer}>ToyLogix · Relații de durată. Idei pentru mâine.</footer>
  </main>;
}

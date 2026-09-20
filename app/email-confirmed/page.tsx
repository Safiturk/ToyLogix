"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "@/lib/supabase";
import s from "../components/account-access.module.css";

type Status = "checking" | "confirmed" | "invalid" | "unavailable";
export default function EmailConfirmedPage() {
  const [state, setState] = useState<Status>("checking");
  useEffect(() => {
    let active = true;
    const finish = (value: Status) => { if (active) setState(value); };
    const timer = setTimeout(() => finish("unavailable"), 15000);
    async function verify() {
      try {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const query = new URLSearchParams(window.location.search);
        if (hash.has("error") || hash.has("error_code") || query.has("error")) {
          window.history.replaceState(null, "", window.location.pathname);
          finish("invalid"); return;
        }
        // The client consumes the confirmation tokens before resolving getSession.
        const { data: session, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session.session) { finish("invalid"); return; }
        const { data, error } = await supabase.auth.getUser();
        if (error) { finish("unavailable"); return; }
        finish(data.user?.email_confirmed_at ? "confirmed" : "invalid");
      } catch { finish("unavailable"); }
      finally { clearTimeout(timer); }
    }
    void verify();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  return <main className={s.page}>
    <header className={s.header}><Link className={s.logo} href="/login"><BrandLogo /></Link></header>
    <div className={s.confirmationLayout}>
      <section className={s.card} aria-labelledby="confirmation-title" aria-busy={state === "checking"}>
        <span className={s.eyebrow}>CONFIRMAREA ADRESEI DE EMAIL</span>
        <div role="status" aria-live="polite">
          <div className={s.confirmationIcon} aria-hidden="true">{state === "checking" ? "…" : state === "confirmed" ? "✓" : "!"}</div>
          <h2 id="confirmation-title">{state === "checking" ? "Verificăm confirmarea…" : state === "confirmed" ? "Email confirmat cu succes!" : state === "invalid" ? "Link indisponibil" : "Nu putem verifica momentan"}</h2>
          <p className={s.intro}>{state === "checking" ? "Te rugăm să aștepți câteva momente." : state === "confirmed" ? "Adresa ta de email este confirmată. Accesul la catalog este disponibil după aprobarea contului de către echipa ToyLogix." : state === "invalid" ? "Linkul poate fi expirat sau deja folosit. Dacă ai confirmat deja adresa, poți continua către autentificare. În caz contrar, contactează echipa ToyLogix pentru un nou link." : "Verifică conexiunea și reîncarcă pagina pentru a încerca din nou."}</p>
        </div>
        {state !== "checking" && <Link className={s.submit} href="/login">Mergi la autentificare →</Link>}
      </section>
    </div>
    <footer className={s.footer}>ToyLogix · Jucării & distribuție B2B</footer>
  </main>;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, initialAuthLink } from "@/lib/supabase";
import s from "../components/account-access.module.css";
import BrandLogo from "../components/BrandLogo";

type Status = "checking" | "confirmed" | "invalid" | "unavailable";
export default function EmailConfirmedPage() {
  const [state, setState] = useState<Status>("checking");
  useEffect(() => {
    let active = true;
    const finish = (value: Status) => {
      if (active) setState(value);
    };
    const timer = setTimeout(() => finish("unavailable"), 15000);
    async function verify() {
      try {
        if (
          initialAuthLink.error ||
          initialAuthLink.type !== "signup" ||
          !initialAuthLink.hasTokens
        ) {
          window.history.replaceState(null, "", window.location.pathname);
          finish("invalid");
          return;
        }
        // The client consumes the confirmation tokens before resolving getSession.
        const { data: session, error: sessionError } =
          await supabase.auth.getSession();
        if (sessionError || !session.session) {
          finish("invalid");
          return;
        }
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          finish("unavailable");
          return;
        }
        finish(data.user?.email_confirmed_at ? "confirmed" : "invalid");
      } catch {
        finish("unavailable");
      } finally {
        clearTimeout(timer);
      }
    }
    void verify();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <main className={s.page}>
      <header className={s.header}>
        <BrandLogo className={s.logo} href="/login" subtitle="PARTNER PORTAL" />
      </header>
      <div className={s.confirmationLayout}>
        <section
          className={s.card}
          aria-labelledby="confirmation-title"
          aria-busy={state === "checking"}
        >
          <span className={s.eyebrow}>CONFIRMAREA ADRESEI DE EMAIL</span>
          <div role="status" aria-live="polite">
            <div className={s.confirmationIcon} aria-hidden="true">
              {state === "checking" ? "…" : state === "confirmed" ? "✓" : "!"}
            </div>
            <h2 id="confirmation-title">
              {state === "checking"
                ? "Verificam confirmarea…"
                : state === "confirmed"
                  ? "Email confirmat cu succes!"
                  : state === "invalid"
                    ? "Link indisponibil"
                    : "Nu putem verifica momentan"}
            </h2>
            <p className={s.intro}>
              {state === "checking"
                ? "Te rugam sa astepti cateva momente."
                : state === "confirmed"
                  ? "Adresa ta de email este confirmata. Accesul la catalog este disponibil dupa aprobarea contului de catre echipa ToyLogix."
                  : state === "invalid"
                    ? "Linkul poate fi expirat sau deja folosit. Daca ai confirmat deja adresa, poti continua catre autentificare. In caz contrar, contacteaza echipa ToyLogix pentru un nou link."
                    : "Verifica conexiunea si reincarca pagina pentru a incerca din nou."}
            </p>
          </div>
          {state !== "checking" && (
            <Link className={s.submit} href="/login">
              Mergi la autentificare →
            </Link>
          )}
        </section>
      </div>
      <footer className={s.footer}>ToyLogix · Jucarii & distributie B2B</footer>
    </main>
  );
}

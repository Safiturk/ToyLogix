"use client";
import { useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import AccountAccess from './AccountAccess';
import { supabase } from "@/lib/supabase";
import s from "../customer.module.css";

const validPhone = (value: string) => /^0[0-9]{9}$/.test(value);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value: string) => /\p{Lu}/u.test(value) && /[0-9]/.test(value) && /[\p{P}\p{S}]/u.test(value);

function PasswordToggle({ visible, toggle, controls }: { visible: boolean; toggle: () => void; controls: string }) {
  return <button type="button" className={s.passwordToggle} onClick={toggle}
    aria-label={visible ? "Ascunde parola" : "Arată parola"} aria-controls={controls} aria-pressed={visible}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {visible && <path d="m3 3 18 18" />}
    </svg>
  </button>;
}


export default function CustomerAuth({
  register = false,
}: {
  register?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const passwordMismatch = register && confirmationChecked && password !== confirmPassword;
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (register) {
      setConfirmationChecked(true);
      if (password !== confirmPassword) {
        document.getElementById("customer-confirm-password")?.focus();
        return;
      }
    }
    if (!validPhone(telefon)) {
      setMessage("Introduceți exact 10 cifre, începând cu 0, fără +40. Exemplu: 0754654876.");
      return;
    }
    if (!validEmail(email.trim())) {
      setMessage("Introduceți o adresă de email validă, de exemplu nume@firma.ro.");
      return;
    }
    if (register && !validPassword(password)) {
      setMessage("Parola trebuie să conțină cel puțin o literă mare, o cifră și un semn de punctuație sau un caracter special (de exemplu !, ?, @).");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      if (register) {
        // Auth owns the password; the existing table retains the B2B approval profile.
        const { data: account, error: accountError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/email-confirmed`, data: {
            nume_complet: name.trim(), telefon: telefon.trim(), nume_firma: company.trim() || null,
          } },
        });
        if (accountError || !account.user) {
          const code = accountError?.code;
          if (accountError?.message.toLowerCase().includes("sending confirmation email")) {
            setMessage("Emailul de confirmare nu a putut fi trimis. Contactează echipa ToyLogix pentru activarea contului.");
          } else if (code === "user_already_exists" || code === "email_exists") {
            setMessage("Există deja un cont cu această adresă. Încearcă autentificarea sau recuperarea parolei.");
          } else if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || accountError?.status === 429) {
            setMessage("Prea multe încercări. Așteaptă câteva minute înainte de a încerca din nou.");
          } else if (code === "weak_password") {
            setMessage("Parola nu îndeplinește cerințele de securitate. Alege o parolă mai lungă și mai puternică.");
          } else if (code === "signup_disabled" || code === "email_provider_disabled") {
            setMessage("Înregistrarea este momentan dezactivată. Contactează echipa ToyLogix.");
          } else {
            setMessage(`Contul nu a putut fi creat. Contactează echipa ToyLogix. Cod: ${code || "registration_unavailable"}.`);
          }
          return;
        }
        if (account.user.identities?.length === 0) {
          setMessage("Verifică emailul sau folosește recuperarea parolei dacă ai deja un cont."); return;
        }
        // Profile creation is atomic with Auth signup via the database trigger.
        await supabase.auth.signOut({ scope: "local" });
        localStorage.removeItem('user_session'); localStorage.removeItem('admin_authenticated');
        window.dispatchEvent(new Event('toylogix-session'));
        // Keep the existing notification integration. A notification failure must not prompt a duplicate registration.
        setNeedsEmailConfirmation(!account.session);
        setSuccess(true);
        try {
          await fetch("https://formspree.io/f/mwvggppn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
              subject: "🔔 Nouă Înregistrare Partener ToyLogix B2B",
              admin_message:
                "S-a înregistrat un nou utilizator pe platforma B2B!",
              nume_complet: name,
              email,
              telefon,
              firma: company || "Client Direct (Fără Firmă)",
            }),
          });
        } catch {
          /* The registration already succeeded. */
        }
      }
    } catch {
      setMessage(
        "Operațiunea nu a putut fi finalizată. Verificați conexiunea și încercați din nou.",
      );
    } finally {
      setLoading(false);
    }
  }
  if (!register) return <AccountAccess mode="login" />;
  return (
    <main className={s.authPage}>
      <section className={s.authStory}>
        <Link href="/store" className={s.logo}>
          <BrandLogo />
        </Link>
        <div>
          <span className={s.eyebrow}>PARTENERI ÎN LUMEA JOCULUI</span>
          <h1>
            Idei mici.
            <br />
            Posibilități <em>mari.</em>
          </h1>
          <p>
            Un catalog de descoperit. Un parteneriat de construit. Totul începe
            cu ToyLogix.
          </p>
          <div className={s.authSteps}>
            <div>
              <b>01</b>
              <span>Descoperă colecțiile de jucării</span>
            </div>
            <div>
              <b>02</b>
              <span>Solicită contul de partener</span>
            </div>
            <div>
              <b>03</b>
              <span>Continuă după aprobarea cererii</span>
            </div>
          </div>
        </div>
        <small>Jucării. Idei. Noi posibilități.</small>
      </section>
      <section className={s.authMain}>
        <div className={s.authForm}>
          <Link href="/store" className={s.authBack}>
            ← Înapoi la catalog
          </Link>
          <span className={s.eyebrow}>
            {register ? "UN NOU ÎNCEPUT" : "BINE AI REVENIT"}
          </span>
          <h2>
            {register ? "Devino partener ToyLogix" : "Intră în contul tău"}
          </h2>
          <p className={s.authIntro}>
            {register
              ? "Completează datele de mai jos. Echipa noastră va verifica solicitarea ta."
              : "Folosește adresa de email și numărul de telefon cu care te-ai înregistrat."}
          </p>
          {success ? (
            <div className={s.formSuccess} role="status">
              <h3>Cererea ta a fost înregistrată.</h3>
              <p>
                Contul este în curs de verificare. Te vei putea autentifica după
                aprobarea cererii. {needsEmailConfirmation && "Verifică emailul și confirmă adresa pentru a te putea autentifica."}
              </p>
              <Link href="/login" className={s.primary}>
                Mergi la autentificare →
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className={s.form} aria-busy={loading}>
              {register && (
                <label className={s.field} htmlFor="customer-name">
                  Nume și prenume
                  <input
                    id="customer-name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Numele tău complet"
                  />
                </label>
              )}
              <label className={s.field} htmlFor="customer-email">
                Adresă de email
                <input
                  id="customer-email"
                  type="email"
                  pattern={"[^\\s@]+@[^\\s@]+\\.[^\\s@]+"}
                  title="Introduceți o adresă validă, de exemplu nume@firma.ro."
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nume@firma.ro"
                  aria-describedby={message ? "auth-message" : undefined}
                />
              </label>
              <label className={s.field} htmlFor="customer-phone">
                Număr de telefon
                <input
                  id="customer-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  minLength={10}
                  pattern="0[0-9]{9}"
                  title="Exact 10 cifre, începând cu 0, fără +40. Exemplu: 0754654876."
                  autoComplete="tel"
                  required
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                  placeholder="07xxxxxxxx"
                  aria-describedby="phone-help"
                />
                <small id="phone-help">
                  Exact 10 cifre, fără +40. Exemplu: 0754654876.
                </small>
              </label>
              {register && (
                <>
                  <div className={s.field}>
                    <label htmlFor="customer-password">Parolă</label>
                    <div className={s.passwordInput}>
                    <input
                      id="customer-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      aria-describedby="password-rules"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Parola contului"
                    />
                    <PasswordToggle visible={showPassword} toggle={() => setShowPassword((shown) => !shown)} controls="customer-password" />
                    </div>
                    <small id="password-rules">Cel puțin o literă mare, o cifră și un semn de punctuație sau un caracter special (de exemplu !, ?, @).</small>
                  </div>
                  <div className={s.field}>
                    <label htmlFor="customer-confirm-password">Confirmă Parola</label>
                    <div className={s.passwordInput}>
                      <input id="customer-confirm-password" type={showConfirmation ? "text" : "password"}
                        autoComplete="new-password" required value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)} onBlur={() => setConfirmationChecked(true)}
                        aria-invalid={passwordMismatch} aria-describedby={passwordMismatch ? "password-mismatch" : undefined}
                        placeholder="Repetă parola" />
                      <PasswordToggle visible={showConfirmation} toggle={() => setShowConfirmation((shown) => !shown)} controls="customer-confirm-password" />
                    </div>
                    {passwordMismatch && <small id="password-mismatch" className={s.passwordError} role="alert">Parolele nu se potrivesc</small>}
                  </div>
                  <label className={s.field} htmlFor="customer-company">
                    Nume firmă <small>Opțional</small>
                    <input
                      id="customer-company"
                      autoComplete="organization"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Numele companiei"
                    />
                  </label>
                  <p className={s.notice}>
                    Înregistrarea trimite o solicitare de acces. Contul devine
                    disponibil după verificarea și aprobarea cererii.
                  </p>
                </>
              )}
              {!register && (
                <label className={s.field} htmlFor="customer-password">
                  Parolă
                  <input id="customer-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Parola contului" />
                </label>
              )}
              {message && (
                <div id="auth-message" className={s.formError} role="alert">
                  {message}
                </div>
              )}
              <button type="submit" className={s.primary} disabled={loading}>
                {loading
                  ? "Se procesează…"
                  : register
                    ? "Trimite solicitarea"
                    : "Autentificare"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          )}
          <p className={s.authBottom}>
            {register ? "Ai deja un cont?" : "Nu ai încă un cont?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Autentifică-te" : "Devino partener"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

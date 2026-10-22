"use client";
import { useState } from "react";
import Link from "next/link";
import AccountAccess from "./AccountAccess";
import BrandLogo from "./BrandLogo";
import { authPost } from "@/lib/auth-client";
import { signOutAccount } from "@/lib/account";
import {
  isRomanianPhone,
  isEmailAddress,
  hasPasswordComplexity,
} from "@/lib/auth-validation";
import s from "../customer.module.css";

function PasswordToggle({
  visible,
  toggle,
  controls,
}: {
  visible: boolean;
  toggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      className={s.passwordToggle}
      onClick={toggle}
      aria-label={visible ? "Ascunde parola" : "Arata parola"}
      aria-controls={controls}
      aria-pressed={visible}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </svg>
    </button>
  );
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
  const passwordMismatch =
    register && confirmationChecked && password !== confirmPassword;
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !register) return;
    setConfirmationChecked(true);
    if (password !== confirmPassword) {
      document.getElementById("customer-confirm-password")?.focus();
      return;
    }
    if (!isRomanianPhone(telefon)) {
      setMessage(
        "Introduceti exact 10 cifre, incepand cu 0, fara +40. Exemplu: 0754654876.",
      );
      return;
    }
    if (!isEmailAddress(email.trim())) {
      setMessage(
        "Introduceti o adresa de email valida, de exemplu nume@firma.ro.",
      );
      return;
    }
    if (!hasPasswordComplexity(password)) {
      setMessage(
        "Parola trebuie sa contina cel putin o litera mare, o cifra si un semn de punctuatie sau un caracter special (de exemplu !, ?, @).",
      );
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await authPost("/api/auth/signup", {
        email: email.trim(),
        password,
        name: name.trim(),
        phone: telefon.trim(),
        company: company.trim(),
      });
      await signOutAccount();
      setNeedsEmailConfirmation(true);
      setSuccess(true);
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "Operatiunea nu a putut fi finalizata. Incercati din nou.",
      );
    } finally {
      setLoading(false);
    }
  }
  if (!register) return <AccountAccess mode="login" />;
  return (
    <main className={s.authPage}>
      <section className={s.authStory}>
        <BrandLogo className={s.logo} />
        <div>
          <span className={s.eyebrow}>PARTENERI IN LUMEA JOCULUI</span>
          <h1>
            Idei mici.
            <br />
            Posibilitati <em>mari.</em>
          </h1>
          <p>
            Un catalog de descoperit. Un parteneriat de construit. Totul incepe
            cu ToyLogix.
          </p>
          <div className={s.authSteps}>
            <div>
              <b>01</b>
              <span>Descopera colectiile de jucarii</span>
            </div>
            <div>
              <b>02</b>
              <span>Solicita contul de partener</span>
            </div>
            <div>
              <b>03</b>
              <span>Continua dupa aprobarea cererii</span>
            </div>
          </div>
        </div>
        <small>Jucarii. Idei. Noi posibilitati.</small>
      </section>
      <section className={s.authMain}>
        <div className={s.authForm}>
          <Link href="/store" className={s.authBack}>
            ← Inapoi la catalog
          </Link>
          <span className={s.eyebrow}>
            {register ? "UN NOU INCEPUT" : "BINE AI REVENIT"}
          </span>
          <h2>
            {register ? "Devino partener ToyLogix" : "Intra in contul tau"}
          </h2>
          <p className={s.authIntro}>
            {register
              ? "Completeaza datele de mai jos. Echipa noastra va verifica solicitarea ta."
              : "Foloseste adresa de email si numarul de telefon cu care te-ai inregistrat."}
          </p>
          {success ? (
            <div className={s.formSuccess} role="status">
              <h3>Cererea ta a fost inregistrata.</h3>
              <p>
                Contul este in curs de verificare. Dupa confirmarea emailului
                poti completa datele de facturare; catalogul este disponibil
                dupa aprobare.{" "}
                {needsEmailConfirmation &&
                  "Verifica emailul si confirma adresa pentru a te putea autentifica."}
              </p>
              <Link href="/login" className={s.primary}>
                Mergi la autentificare →
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className={s.form} aria-busy={loading}>
              {register && (
                <label className={s.field} htmlFor="customer-name">
                  Nume si prenume
                  <input
                    id="customer-name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Numele tau complet"
                  />
                </label>
              )}
              <label className={s.field} htmlFor="customer-email">
                Adresa de email
                <input
                  id="customer-email"
                  type="email"
                  pattern={"[^\\s@]+@[^\\s@]+\\.[^\\s@]+"}
                  title="Introduceti o adresa valida, de exemplu nume@firma.ro."
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nume@firma.ro"
                  aria-describedby={message ? "auth-message" : undefined}
                />
              </label>
              <label className={s.field} htmlFor="customer-phone">
                Numar de telefon
                <input
                  id="customer-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  minLength={10}
                  pattern="0[0-9]{9}"
                  title="Exact 10 cifre, incepand cu 0, fara +40. Exemplu: 0754654876."
                  autoComplete="tel"
                  required
                  value={telefon}
                  onChange={(e) =>
                    setTelefon(
                      e.target.value.replace(/[^0-9]/g, "").slice(0, 10),
                    )
                  }
                  placeholder="07xxxxxxxx"
                  aria-describedby="phone-help"
                />
                <small id="phone-help">
                  Exact 10 cifre, fara +40. Exemplu: 0754654876.
                </small>
              </label>
              {register && (
                <>
                  <div className={s.field}>
                    <label htmlFor="customer-password">Parola</label>
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
                      <PasswordToggle
                        visible={showPassword}
                        toggle={() => setShowPassword((shown) => !shown)}
                        controls="customer-password"
                      />
                    </div>
                    <small id="password-rules">
                      Cel putin o litera mare, o cifra si un semn de punctuatie
                      sau un caracter special (de exemplu !, ?, @).
                    </small>
                  </div>
                  <div className={s.field}>
                    <label htmlFor="customer-confirm-password">
                      Confirma Parola
                    </label>
                    <div className={s.passwordInput}>
                      <input
                        id="customer-confirm-password"
                        type={showConfirmation ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onBlur={() => setConfirmationChecked(true)}
                        aria-invalid={passwordMismatch}
                        aria-describedby={
                          passwordMismatch ? "password-mismatch" : undefined
                        }
                        placeholder="Repeta parola"
                      />
                      <PasswordToggle
                        visible={showConfirmation}
                        toggle={() => setShowConfirmation((shown) => !shown)}
                        controls="customer-confirm-password"
                      />
                    </div>
                    {passwordMismatch && (
                      <small
                        id="password-mismatch"
                        className={s.passwordError}
                        role="alert"
                      >
                        Parolele nu se potrivesc
                      </small>
                    )}
                  </div>
                  <label className={s.field} htmlFor="customer-company">
                    Nume firma <small>Optional</small>
                    <input
                      id="customer-company"
                      autoComplete="organization"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Numele companiei"
                    />
                  </label>
                  <p className={s.notice}>
                    Inregistrarea trimite o solicitare de acces. Contul devine
                    disponibil dupa verificarea si aprobarea cererii.
                  </p>
                </>
              )}
              {!register && (
                <label className={s.field} htmlFor="customer-password">
                  Parola
                  <input
                    id="customer-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Parola contului"
                  />
                </label>
              )}
              {message && (
                <div id="auth-message" className={s.formError} role="alert">
                  {message}
                </div>
              )}
              <button type="submit" className={s.primary} disabled={loading}>
                {loading
                  ? "Se proceseaza…"
                  : register
                    ? "Trimite solicitarea"
                    : "Autentificare"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          )}
          <p className={s.authBottom}>
            {register ? "Ai deja un cont?" : "Nu ai inca un cont?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Autentifica-te" : "Devino partener"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

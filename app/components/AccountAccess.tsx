"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, initialAuthLink } from "@/lib/supabase";
import { authPost, passwordLogin } from "@/lib/auth-client";
import { accountDestination, isRecoveryLink } from "@/lib/security-rules";
import { accountColumns, signOutAccount, type Account } from "@/lib/account";
import { hasPasswordComplexity } from "@/lib/auth-validation";
import { loginErrorCode, loginMessages } from "@/lib/login-errors";
import s from "./account-access.module.css";
import BrandLogo from "./BrandLogo";
import LoginStationery from "./LoginStationery";

type Mode = "login" | "forgot" | "update";

function PasswordField({
  id,
  label,
  value,
  change,
  confirm = false,
  invalid = false,
}: {
  id: string;
  label: string;
  value: string;
  change: (value: string) => void;
  confirm?: boolean;
  invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      <div className={s.password}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => change(event.target.value)}
          required
          autoComplete={
            id === "login-password" ? "current-password" : "new-password"
          }
          aria-invalid={invalid}
          aria-describedby={
            invalid
              ? "password-mismatch"
              : id === "new-password"
                ? "password-help"
                : undefined
          }
          placeholder={confirm ? "Repeta parola noua" : "Introdu parola"}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-controls={id}
          aria-pressed={visible}
          aria-label={`${visible ? "Ascunde" : "Arata"}: ${label}`}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="m3 3 18 18" />}
          </svg>
        </button>
      </div>
    </div>
  );
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
    async function checkRecovery() {
      try {
        const { data: user, error } = await supabase.auth.getUser();
        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (active)
          setSessionReady(
            !error &&
              !assuranceError &&
              Boolean(user.user) &&
              isRecoveryLink(
                initialAuthLink,
                assurance?.currentAuthenticationMethods || [],
              ),
          );
      } catch {
        if (active) setSessionReady(false);
      } finally {
        if (active) setSessionChecked(true);
      }
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (active) void checkRecovery();
      }, 0);
    });
    void checkRecovery();
    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
      if (password !== confirmation) {
        document.getElementById("confirm-password")?.focus();
        return;
      }
      if (password.length < 8 || !hasPasswordComplexity(password)) {
        setError(
          "Alege minimum 8 caractere, o litera mare, o cifra si un caracter special.",
        );
        return;
      }
      if (!sessionReady) {
        setError("Linkul nu mai este valid. Solicita un link nou.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        await authPost("/api/auth/reset", { email: email.trim() });
        setSuccess(true);
        return;
      }
      if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          setError(
            error.code === "same_password"
              ? "Alege o parola diferita de cea anterioara."
              : "Parola nu a putut fi actualizata. Verifica cerintele sau solicita un link nou.",
          );
          return;
        }
        await signOutAccount("global");
        setPassword("");
        setConfirmation("");
        setSuccess(true);
        return;
      }
      const { data: auth, error } = await passwordLogin(email.trim(), password);
      if (error || !auth.user) {
        setError(
          error ? loginMessages[loginErrorCode(error)] : loginMessages.unavailable,
        );
        return;
      }
      if (!auth.user.email_confirmed_at) {
        await signOutAccount();
        setError(loginMessages.email_not_confirmed);
        return;
      }
      // B2B approval remains a separate requirement from password authentication.
      const { data: profile, error: profileError } = await supabase
        .from("utilizatori")
        .select(accountColumns)
        .eq("auth_user_id", auth.user.id)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle()
        .overrideTypes<Account | null, { merge: false }>();
      if (
        profileError ||
        !profile ||
        profile.status !== "approved" ||
        profile.is_active === false
      ) {
        await supabase.auth.signOut({ scope: "local" });
        localStorage.removeItem("user_session");
        localStorage.removeItem("admin_authenticated");
        setError(
          profileError
            ? loginMessages.unavailable
            : profile?.status === "pending" && profile.is_active !== false
            ? loginMessages.approval_pending
            : "Accesul la cont nu este disponibil. Contacteaza echipa ToyLogix.",
        );
        return;
      }
      localStorage.setItem("user_session", JSON.stringify(profile));
      localStorage.removeItem("admin_authenticated");
      window.dispatchEvent(new Event("toylogix-session"));
      let adminVerified = false;
      if (profile.rol === "admin") {
        const { data, error } = await supabase.rpc("toylogix_is_admin");
        if (error) throw error;
        adminVerified = data === true;
      }
      router.replace(accountDestination(profile, adminVerified));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Conexiunea a fost intrerupta. Incearca din nou.",
      );
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "login"
      ? "Bine ai revenit."
      : mode === "forgot"
        ? "Ai uitat parola?"
        : "O parola noua.";
  return (
    <main className={s.page}>
      <header className={s.header}>
        <BrandLogo className={s.logo} subtitle="PARTNER PORTAL" />
        <span>Jucarii & distributie B2B</span>
      </header>
      <div className={s.layout}>
        <section className={s.story}>
          {mode === "login" && <LoginStationery />}
          <div className={s.storyAccent} aria-hidden="true">
            <span />
            <span />
          </div>
          <span className={s.eyebrow}>UN PARTENERIAT. NOI POSIBILITATI.</span>
          <h1>
            Mai multa joaca.
            <br />
            <em>Mai mult potential.</em>
          </h1>
          <p>
            Catalogul, preturile en-gros si disponibilitatea produselor —
            intr-un singur loc, pentru afacerea ta.
          </p>
        </section>
        <section className={s.card} aria-labelledby="access-title">
          <div className={s.cardTop}>
            <span className={s.eyebrow}>CONTUL TAU TOYLOGIX</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <rect x="5" y="10" width="14" height="11" rx="3" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h2 id="access-title">{title}</h2>
          <p className={s.intro}>
            {mode === "login"
              ? "Intra in cont cu adresa de email si parola ta."
              : mode === "forgot"
                ? "Iti trimitem un link pentru a alege o parola noua."
                : "Alege o parola pe care o folosesti doar pentru acest cont."}
          </p>
          {success ? (
            <div className={s.success} role="status">
              <span aria-hidden="true">✓</span>
              <h3>
                {mode === "forgot"
                  ? "Verifica emailul"
                  : "Parola a fost actualizata"}
              </h3>
              <p>
                {mode === "forgot"
                  ? "Daca exista un cont eligibil pentru aceasta adresa, vei primi un link de resetare. Verifica si folderul Spam."
                  : "Te redirectionam catre autentificare. Foloseste noua parola."}
              </p>
              <Link href="/login">Inapoi la autentificare →</Link>
            </div>
          ) : mode === "update" && !sessionReady ? (
            <div className={s.notice} role="status">
              <p>
                {sessionChecked
                  ? "Linkul lipseste, a expirat sau a fost deja folosit."
                  : "Verificam linkul de resetare…"}
              </p>
              {sessionChecked && (
                <Link href="/forgot-password">Solicita un link nou →</Link>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className={s.form} aria-busy={busy}>
              {mode !== "update" && (
                <div className={s.field}>
                  <label htmlFor="access-email">Adresa de email</label>
                  <input
                    id="access-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nume@companie.ro"
                  />
                </div>
              )}
              {mode !== "forgot" && (
                <PasswordField
                  id={mode === "login" ? "login-password" : "new-password"}
                  label={mode === "login" ? "Parola" : "Parola noua"}
                  value={password}
                  change={setPassword}
                />
              )}
              {mode === "login" && (
                <Link className={s.forgot} href="/forgot-password">
                  Ai uitat parola?
                </Link>
              )}
              {mode === "update" && (
                <>
                  <p id="password-help" className={s.help}>
                    Minimum 8 caractere, o litera mare, o cifra si un caracter
                    special.
                  </p>
                  <PasswordField
                    id="confirm-password"
                    label="Confirma parola noua"
                    value={confirmation}
                    change={setConfirmation}
                    confirm
                    invalid={mismatch}
                  />
                  {mismatch && (
                    <p id="password-mismatch" className={s.error} role="alert">
                      Parolele nu se potrivesc.
                    </p>
                  )}
                </>
              )}
              {error && (
                <p className={s.error} role="alert">
                  {error}
                </p>
              )}
              <button className={s.submit} type="submit" disabled={busy}>
                {busy && <span className={s.spinner} aria-hidden="true" />}
                {busy
                  ? "Se proceseaza…"
                  : mode === "login"
                    ? "Intra in cont"
                    : mode === "forgot"
                      ? "Trimite linkul de resetare"
                      : "Salveaza parola noua"}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>
          )}
          <div className={s.cardFooter}>
            {mode === "login" ? (
              <>
                Nu ai inca un cont?{" "}
                <Link href="/register">Devino partener</Link>
              </>
            ) : (
              <Link href="/login">← Inapoi la autentificare</Link>
            )}
          </div>
        </section>
      </div>
      <footer className={s.footer}>
        ToyLogix · Relatii de durata. Idei pentru maine.
      </footer>
    </main>
  );
}

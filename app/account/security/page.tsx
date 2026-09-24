"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { currentAccount, signOutAccount } from "@/lib/account";
import { authPost } from "@/lib/auth-client";
import s from "../../components/account-access.module.css";

export default function AccountSecurityPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [factors, setFactors] = useState<
    { id: string; friendly_name?: string }[]
  >([]);
  const [factorId, setFactorId] = useState("");
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const account = await currentAccount();
        if (!active) return;
        if (!account || account.is_active === false) {
          router.replace("/login");
          return;
        }
        if (account.rol !== "admin" || account.status !== "approved") {
          router.replace(account.rol === "admin" ? "/login" : "/account");
          return;
        }
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const { data: allowed, error: denied } =
          await supabase.rpc("toylogix_is_admin");
        if (denied) throw denied;
        if (!active) return;
        setFactors(data.totp);
        setFactorId(data.totp[0]?.id || "");
        setVerified(Boolean(allowed));
        setReady(true);
      } catch {
        if (active)
          setMessage(
            "Securitatea contului nu poate fi verificată. Reîncarcă pagina.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operațiunea nu a reușit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function enroll() {
    const { data: existing, error: listError } =
      await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    // Failed/cancelled enrollment must not exhaust the provider's factor slots.
    for (const factor of existing.all.filter(
      (item) => item.status === "unverified" && item.factor_type === "totp",
    )) {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });
      if (error) throw error;
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "ToyLogix Administrator",
      issuer: "ToyLogix",
    });
    if (error) throw error;
    setFactorId(data.id);
    setSetup({
      qr: data.totp.qr_code.startsWith("data:")
        ? data.totp.qr_code
        : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.totp.qr_code)}`,
      secret: data.totp.secret,
    });
  }

  async function verify() {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    if (error)
      throw new Error(
        "Codul nu este valid sau a expirat. Folosește codul curent din aplicație.",
      );
    const { data: allowed, error: denied } =
      await supabase.rpc("toylogix_is_admin");
    if (denied || !allowed)
      throw new Error("Accesul de administrator nu mai este disponibil.");
    setVerified(true);
    setSetup(null);
    setCode("");
    setMessage(
      "Verificare reușită. Salvează codurile de recuperare într-un loc sigur.",
    );
  }

  return (
    <main className={s.page}>
      <div className={s.confirmationLayout}>
        <section className={s.card} aria-busy={busy}>
          <span className={s.eyebrow}>SECURITATEA CONTULUI</span>
          <h1>Verificare în doi pași</h1>
          <p className={s.intro}>
            Pentru administrare, confirmă accesul cu aplicația de autentificare.
          </p>
          {message && (
            <p role="status" className={s.notice}>
              {message}
            </p>
          )}
          {!ready ? (
            <p>Se verifică accesul…</p>
          ) : verified ? (
            <>
              <p>Accesul de administrator este verificat.</p>
              <button
                className={s.submit}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (
                      !window.confirm(
                        "Generezi 10 coduri noi? Codurile anterioare nu vor mai funcționa.",
                      )
                    )
                      return;
                    const { data, error } = await supabase.rpc(
                      "rotate_recovery_codes",
                    );
                    if (error) throw error;
                    setCodes(data as string[]);
                  })
                }
              >
                Generează coduri de recuperare
              </button>
              {codes.length > 0 && (
                <div className={s.notice}>
                  <p>
                    Se afișează doar acum. Fiecare cod poate fi folosit o
                    singură dată. Păstrează-le separat de telefon.
                  </p>
                  <pre className="overflow-x-auto select-all text-sm">
                    {codes.join("\n")}
                  </pre>
                  <button onClick={() => setCodes([])}>
                    Am salvat codurile — ascunde
                  </button>
                </div>
              )}
              <Link className={s.submit} href="/admin">
                Continuă către administrare →
              </Link>
              <Link href="/account">Datele contului</Link>
            </>
          ) : (
            <>
              {factors.length === 0 && !setup && (
                <button
                  className={s.submit}
                  disabled={busy}
                  onClick={() => void run(enroll)}
                >
                  Configurează aplicația de autentificare
                </button>
              )}
              {setup && (
                <div className={s.notice}>
                  <p>
                    Scanează codul cu aplicația de autentificare, apoi introdu
                    codul de 6 cifre.
                  </p>
                  <Image
                    src={setup.qr}
                    alt="Cod QR pentru configurarea autentificării ToyLogix"
                    width={220}
                    height={220}
                    unoptimized
                  />
                  <p>Cheie pentru introducere manuală:</p>
                  <code className="break-all select-all">{setup.secret}</code>
                </div>
              )}
              {factorId && (
                <form
                  className={s.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(verify);
                  }}
                >
                  {factors.length > 1 && (
                    <label>
                      Alege dispozitivul
                      <select
                        value={factorId}
                        onChange={(event) => setFactorId(event.target.value)}
                      >
                        {factors.map((factor) => (
                          <option key={factor.id} value={factor.id}>
                            {factor.friendly_name || factor.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className={s.field}>
                    Cod din aplicație
                    <input
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      required
                      maxLength={6}
                    />
                  </label>
                  <button className={s.submit} disabled={busy}>
                    Verifică
                  </button>
                </form>
              )}
              <details className={s.notice}>
                <summary>Nu mai ai acces la dispozitiv?</summary>
                <p>
                  Folosește un cod de recuperare salvat. Dispozitivele 2FA și
                  sesiunile vor fi revocate. Reconectează-te și configurează un
                  dispozitiv nou.
                </p>
                <form
                  className={s.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      await authPost(
                        "/api/auth/mfa/recover",
                        { code: recovery.trim() },
                        true,
                      );
                      setRecovery("");
                      await signOutAccount();
                      router.replace("/login");
                    });
                  }}
                >
                  <label className={s.field}>
                    Cod de recuperare
                    <input
                      type="password"
                      autoComplete="off"
                      value={recovery}
                      onChange={(event) => setRecovery(event.target.value)}
                      pattern="[a-fA-F0-9]{32}"
                      required
                    />
                  </label>
                  <button className={s.submit} disabled={busy}>
                    Recuperează accesul
                  </button>
                </form>
              </details>
            </>
          )}
          <button
            className={s.forgot}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await signOutAccount();
                router.replace("/login");
              })
            }
          >
            Deconectare
          </button>
        </section>
      </div>
    </main>
  );
}

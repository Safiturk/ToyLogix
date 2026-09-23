"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  currentAccount,
  signOutAccount,
  billingFields,
  type Billing,
  type Account,
} from "@/lib/account";
import s from "../admin/product-form.module.css";

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Account | null>(null);
  const [billing, setBilling] = useState<Billing>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const account = await currentAccount();
        if (!active) return;
        if (!account) {
          router.replace("/login");
          return;
        }
        if (account.rol === "admin") {
          const { data: verified, error: denied } =
            await supabase.rpc("toylogix_is_admin");
          if (denied) throw denied;
          if (!verified) {
            router.replace("/account/security");
            return;
          }
        }
        const { data, error } = await supabase
          .from("billing_profiles")
          .select("*")
          .eq("user_id", account.auth_user_id)
          .maybeSingle();
        if (error) throw error;
        if (active) {
          setProfile(account);
          setBilling(data || {});
          setReady(true);
        }
      } catch {
        if (active)
          setMessage(
            "Datele contului nu pot fi încărcate. Reîncarcă pagina sau contactează administratorul.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const account = await currentAccount();
      if (!account || account.auth_user_id !== profile.auth_user_id)
        throw new Error("Session changed");
      const { error } = await supabase.rpc("save_my_account", {
        details: {
          nume_complet: profile.nume_complet.trim(),
          telefon: profile.telefon.trim(),
          nume_firma: profile.nume_firma?.trim() || "",
          ...Object.fromEntries(
            billingFields.map(([key]) => [key, billing[key]?.trim() || ""]),
          ),
          vat_registered: Boolean(billing.vat_registered),
        },
      });
      if (error) throw error;
      localStorage.setItem(
        "user_session",
        JSON.stringify({
          ...account,
          nume_complet: profile.nume_complet.trim(),
          telefon: profile.telefon.trim(),
          nume_firma: profile.nume_firma,
        }),
      );
      window.dispatchEvent(new Event("toylogix-session"));
      setMessage("Datele au fost salvate cu succes.");
    } catch {
      setMessage(
        "Salvarea nu a reușit. Verifică datele și conexiunea, apoi încearcă din nou.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#fcfbfe] p-4 md:p-8 text-[#24213b]">
      <div className="max-w-4xl mx-auto space-y-6">
        <nav className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <Link href="/store">← ToyLogix / Catalog</Link>
          <div className="flex items-center gap-5">
            {profile?.rol === "admin" && profile.status === "approved" && (
              <>
                <Link href="/account/security">Securitate / 2FA</Link>
                <Link href="/admin">Admin Panel</Link>
              </>
            )}
            <button
              type="button"
              className="cursor-pointer text-slate-600 hover:text-violet-700"
              onClick={async () => {
                await signOutAccount();
                router.replace("/login");
              }}
            >
              Ieșire
            </button>
          </div>
        </nav>
        <section className={s.card}>
          <header className={s.heading}>
            <div>
              <p className={s.eyebrow}>CONTUL MEU</p>
              <h1 className="text-2xl font-semibold">
                Profil și date de facturare
              </h1>
              <p className={s.subtitle}>
                Datele tale de contact, companie și livrare.
              </p>
            </div>
          </header>
          {message && (
            <p
              role="status"
              className="mx-8 mt-6 rounded-xl bg-violet-50 p-4 text-sm"
            >
              {message}
            </p>
          )}
          {!ready ? (
            <p className="p-8" role="status">
              {message ? "Date indisponibile." : "Se încarcă…"}
            </p>
          ) : (
            profile && (
              <form className={s.form} onSubmit={save} aria-busy={busy}>
                {profile.status !== "approved" && (
                  <p className="text-sm text-amber-800">
                    {profile.status === "pending"
                      ? "Contul așteaptă aprobarea echipei. Între timp, poți completa datele pentru facturare."
                      : "Accesul la catalog nu este aprobat. Contactează echipa ToyLogix."}
                  </p>
                )}
                <div className={s.sectionTitle}>
                  <h2>Date de contact</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {(["nume_complet", "telefon", "nume_firma"] as const).map(
                    (key) => (
                      <div key={key}>
                        <label className="block" htmlFor={key}>
                          {
                            {
                              nume_complet: "Nume și prenume",
                              telefon: "Telefon",
                              nume_firma: "Nume firmă",
                            }[key]
                          }
                        </label>
                        <input
                          className="w-full"
                          id={key}
                          required={key !== "nume_firma"}
                          maxLength={key === "telefon" ? 30 : 200}
                          type={key === "telefon" ? "tel" : "text"}
                          value={profile[key] || ""}
                          onChange={(e) =>
                            setProfile({ ...profile, [key]: e.target.value })
                          }
                        />
                      </div>
                    ),
                  )}
                  <div>
                    <label className="block" htmlFor="account-email">
                      Email de autentificare
                    </label>
                    <input
                      className="w-full"
                      id="account-email"
                      value={profile.email}
                      readOnly
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Adresa verificată a contului.
                    </p>
                  </div>
                </div>
                <div className={s.sectionTitle}>
                  <h2>Facturare și livrare</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {billingFields.map(([key, label]) => (
                    <div key={key}>
                      <label className="block" htmlFor={key}>
                        {label}
                      </label>
                      <input
                        className="w-full"
                        id={key}
                        type={key === "billing_email" ? "email" : "text"}
                        maxLength={500}
                        value={billing[key] || ""}
                        onChange={(e) =>
                          setBilling({ ...billing, [key]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(billing.vat_registered)}
                    onChange={(e) =>
                      setBilling({
                        ...billing,
                        vat_registered: e.target.checked,
                      })
                    }
                  />
                  Plătitor de TVA
                </label>
                <div className={s.footer}>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-violet-700"
                  >
                    Schimbă parola
                  </Link>
                  <button className={s.saveButton} disabled={busy}>
                    {busy ? "Se salvează…" : "Salvează datele"}
                  </button>
                </div>
              </form>
            )
          )}
        </section>
      </div>
    </main>
  );
}

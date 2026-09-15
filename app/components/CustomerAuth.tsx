"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import s from "../customer.module.css";

const validPhone = (value: string) => /^0[0-9]{9}$/.test(value);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value: string) => /\p{Lu}/u.test(value) && /[0-9]/.test(value) && /[\p{P}\p{S}]/u.test(value);

async function hashPassword(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function CustomerAuth({
  register = false,
}: {
  register?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
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
        // Preserve the current registration schema and approval workflow.
        const { error } = await supabase.from("utilizatori").insert([
          {
            nume_complet: name.trim(),
            email: email.trim(),
            telefon: telefon.trim(),
            parola: await hashPassword(password.trim()),
            nume_firma: company.trim() || null,
            status: "pending",
            rol: "user",
          },
        ]);
        if (error) {
          setMessage(
            error.code === "23505"
              ? "Există deja un cont cu aceste date. Încercați să vă autentificați."
              : "Cererea nu a putut fi trimisă. Verificați conexiunea și încercați din nou.",
          );
          return;
        }
        // Keep the existing notification integration. A notification failure must not prompt a duplicate registration.
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
      } else {
        // Preserve the existing email + phone login and session keys used by the admin.
        const { data, error } = await supabase
          .from("utilizatori")
          .select("*")
          .eq("email", email.trim())
          .eq("telefon", telefon.trim())
          .abortSignal(AbortSignal.timeout(15000))
          .maybeSingle();
        if (error) {
          setMessage(
            "Conectarea nu este disponibilă momentan. Încercați din nou în câteva momente.",
          );
          return;
        }
        if (!data) {
          setMessage(
            "Nu am găsit un cont cu această adresă de email și acest număr de telefon. Folosiți datele exacte de la înregistrare.",
          );
          return;
        }
        const passwordHash = await hashPassword(password.trim());
        // Existing accounts may still contain the old plain value; new registrations always use a hash.
        if (data.parola !== passwordHash && data.parola !== password.trim()) {
          setMessage("Parola introdusă este incorectă.");
          return;
        }
        if (data.status === "pending") {
          setMessage(
            "Contul dumneavoastră este în curs de verificare. Veți putea intra după aprobarea cererii.",
          );
          return;
        }
        if (data.status === "rejected") {
          setMessage(
            "Cererea de înregistrare nu a fost aprobată. Contactați echipa ToyLogix pentru clarificări.",
          );
          return;
        }
        localStorage.setItem("user_session", JSON.stringify(data));
        if (data.rol === "admin") {
          localStorage.setItem("admin_authenticated", "true");
          router.push("/admin");
        } else router.push("/store");
      }
    } catch {
      setMessage(
        "Operațiunea nu a putut fi finalizată. Verificați conexiunea și încercați din nou.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className={s.authPage}>
      <section className={s.authStory}>
        <Link href="/store" className={s.logo}>
          <span className={s.logoMark}>
            T<span>·</span>
          </span>
          <span>
            ToyLogix<small>JUCĂRII & DISTRIBUȚIE B2B</small>
          </span>
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
                aprobarea cererii.
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
                  <label className={s.field} htmlFor="customer-password">
                    Parolă
                    <input
                      id="customer-password"
                      type="password"
                      autoComplete="new-password"
                      aria-describedby="password-rules"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Parola contului"
                    />
                    <small id="password-rules">Cel puțin o literă mare, o cifră și un semn de punctuație sau un caracter special (de exemplu !, ?, @).</small>
                  </label>
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

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "@/app/components/BrandLogo";
import { currentAccount, billingFields, type Billing } from "@/lib/account";
import { supabase } from "@/lib/supabase";
import { CARD_COLUMNS, hasArchiveColumn } from "@/lib/catalog-query";
import type { ProductCard } from "@/lib/catalog";
import {
  cartTotals,
  companyDetails,
  emailMessage,
  lineTotals,
  mailtoLink,
  MAX_BOXES,
  money,
  parseCart,
  requestNotice,
  validProduct,
} from "@/lib/order-request";
import { useCart } from "../useCart";
import { useStoreSession } from "../useStoreSession";
import s from "../cart.module.css";

type Prepared = {
  key: string;
  file: File;
  company: string[][];
  missing: boolean;
  download: (file: File) => void;
};
export default function CartPage() {
  const cart = useCart();
  const { user } = useStoreSession();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [recipient, setRecipient] = useState("");
  const [revision, setRevision] = useState(0);
  const [sharing, setSharing] = useState(false);
  const raw = cart.raw;
  const key = `${user?.id}:${raw}:${revision}`;
  const ready = prepared?.key === key ? prepared : null;
  useEffect(() => {
    const refresh = () => setRevision((r) => r + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("toylogix-session", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("toylogix-session", refresh);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const lines = parseCart(raw);
    if (!lines.length || !user?.id) return;
    void (async () => {
      try {
        const account = await currentAccount();
        if (
          !account ||
          account.id !== user.id ||
          account.status !== "approved" ||
          account.is_active === false
        )
          throw new Error("Contul nu este disponibil. Autentifică-te din nou.");
        const { data: billing, error: billingError } = await supabase
          .from("billing_profiles")
          .select(billingFields.map(([field]) => field).join(","))
          .eq("user_id", account.auth_user_id)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (billingError)
          throw new Error(
            "Datele companiei nu pot fi încărcate. Încearcă din nou.",
          );
        const archive = await hasArchiveColumn(supabase, controller.signal);
        let query = supabase
          .from("produse")
          .select(`${CARD_COLUMNS},cod_bara`)
          .in(
            "id",
            lines.map((l) => l.product.id),
          );
        if (archive) query = query.eq("is_archived", false);
        const { data: products, error: productError } = await query.abortSignal(
          controller.signal,
        );
        if (productError)
          throw new Error("Produsele nu pot fi verificate. Încearcă din nou.");
        const fresh = lines.map((line) => {
          const product = (
            products as unknown as (ProductCard & { cod_bara: string })[]
          ).find((p) => p.id === line.product.id);
          if (!product || !validProduct(product))
            throw new Error(
              `Produs indisponibil sau incomplet: ${line.product.nume_produs}. Elimină-l din coș pentru a continua.`,
            );
          return { ...line, product };
        });
        if (!active) return;
        if (
          fresh.some(
            (l, i) =>
              l.product.pret_engros !== lines[i].product.pret_engros ||
              l.product.bucati_per_cutie !==
                lines[i].product.bucati_per_cutie ||
              l.product.nume_produs !== lines[i].product.nume_produs,
          )
        ) {
          // Do not overwrite changes made in another tab while the request was running.
          const storageKey = `toylogix-cart-v1:${account.id}`;
          if (localStorage.getItem(storageKey) === raw) {
            localStorage.setItem(storageKey, JSON.stringify(fresh));
            window.dispatchEvent(new Event("toylogix-cart"));
            setStatus(
              "Coșul a fost actualizat cu prețurile și ambalajele curente. Verifică totalurile.",
            );
          }
          return;
        }
        const company = companyDetails(account, (billing || {}) as Billing);
        const pdf = await import("@/lib/order-pdf");
        const assets = await pdf.loadPdfAssets();
        const file = pdf.createOrderPdf(
          {
            company,
            lines: fresh,
            barcodes: Object.fromEntries(
              fresh.map((l) => [l.product.id, l.product.cod_bara]),
            ),
            date: new Date(),
          },
          assets,
        );
        if (active) {
          setPrepared({
            key,
            company,
            file,
            download: pdf.downloadPdf,
            missing: company.some(([, value]) => value === "Nespecificat"),
          });
          setError("");
        }
      } catch (failure) {
        if (active) {
          setPrepared(null);
          setError(
            failure instanceof Error
              ? failure.message
              : "PDF-ul nu poate fi pregătit. Încearcă din nou.",
          );
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [raw, user?.id, key]);
  const total = cartTotals(cart.lines);
  const message = emailMessage(
    ready?.company[0][1] || "Nespecificat",
    cart.lines,
  );
  function email(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    ready.download(ready.file);
    setStatus(
      "PDF-ul a fost descărcat. Atașează-l manual la e-mail înainte de trimitere. Dacă aplicația de e-mail nu se deschide, folosește linkul de mai jos.",
    );
    window.location.href = mailtoLink(recipient, message);
  }
  async function share() {
    if (!ready) return;
    ready.download(ready.file);
    if (!navigator.canShare?.({ files: [ready.file] }) || !navigator.share) {
      setStatus(
        "Partajarea fișierelor nu este disponibilă. PDF-ul a fost descărcat; folosește trimiterea prin e-mail și atașează-l manual.",
      );
      return;
    }
    setSharing(true);
    try {
      await navigator.share({
        files: [ready.file],
        title: message.subject,
        text: message.body,
      });
      setStatus(
        "PDF-ul a fost partajat. Verifică destinatarul și atașamentul în aplicația aleasă.",
      );
    } catch (failure) {
      setStatus(
        failure instanceof DOMException && failure.name === "AbortError"
          ? "Partajare anulată. PDF-ul rămâne descărcat."
          : "Partajarea nu a reușit. PDF-ul a fost descărcat; atașează-l manual la e-mail.",
      );
    } finally {
      setSharing(false);
    }
  }
  return (
    <main className={s.page}>
      <div className={s.container}>
        <div className={s.heading}>
          <BrandLogo className={s.logo} />
          <Link href="/store">← Continuă cumpărăturile</Link>
        </div>
        <div className={s.heading}>
          <div>
            <p className={s.muted}>TOYLOGIX · PARTENERI B2B</p>
            <h1>Coșul meu / Cerere de comandă</h1>
          </div>
          {cart.lines.length > 0 && (
            <button
              className={s.secondary}
              onClick={() => {
                cart.update(() => []);
                setStatus("Coșul a fost golit.");
              }}
            >
              Golește coșul
            </button>
          )}
        </div>
        <p className={s.notice}>{requestNotice}</p>
        {(cart.error || status) && (
          <p className={s.notice} role="status">
            {cart.error || status}
          </p>
        )}
        {!cart.lines.length ? (
          <section className={s.panel}>
            <h2>Coșul este gol.</h2>
            <Link href="/store">
              Descoperă produsele și adaugă prima cutie →
            </Link>
          </section>
        ) : (
          <>
            <section className={s.panel} aria-label="Produse în coș">
              <p className={s.muted}>
                Cantitățile se solicită în cutii întregi. Cantitate (bucăți) =
                cutii × bucăți per cutie.
              </p>
              {cart.lines.map((line) => (
                <article className={s.line} key={line.product.id}>
                  <div>
                    <h2>{line.product.nume_produs}</h2>
                    <p>
                      {line.product.bucati_per_cutie} buc./cutie ·{" "}
                      {money(lineTotals(line).unitCents)} / buc.
                    </p>
                    <p>Cantitate: {lineTotals(line).quantity} bucăți</p>
                  </div>
                  <label>
                    Număr de cutii
                    <input
                      aria-label={`Cutii: ${line.product.nume_produs}`}
                      type="number"
                      min="1"
                      max={MAX_BOXES}
                      step="1"
                      value={line.boxes}
                      onChange={(e) => {
                        const boxes = Number(e.target.value);
                        if (
                          Number.isInteger(boxes) &&
                          boxes > 0 &&
                          boxes <= MAX_BOXES
                        )
                          cart.update((rows) =>
                            rows.map((l) =>
                              l.product.id === line.product.id
                                ? { ...l, boxes }
                                : l,
                            ),
                          );
                      }}
                    />
                  </label>
                  <strong>{money(lineTotals(line).cents)}</strong>
                  <button
                    className={s.secondary}
                    aria-label={`Elimină ${line.product.nume_produs}`}
                    onClick={() =>
                      cart.update((rows) =>
                        rows.filter((l) => l.product.id !== line.product.id),
                      )
                    }
                  >
                    Elimină
                  </button>
                </article>
              ))}
              <div className={s.totals}>
                <span>
                  {cart.lines.length} produse · <b>{total.boxes} cutii</b> ·{" "}
                  {total.quantity} bucăți
                </span>
                <strong>Total estimativ: {money(total.cents)}</strong>
              </div>
            </section>
            <section className={s.panel}>
              <h2>Datele companiei din cont</h2>
              {ready ? (
                <>
                  <dl className={s.company}>
                    {ready.company.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {ready.missing && (
                    <p className={s.notice}>
                      Unele date lipsesc și vor apărea ca „Nespecificat” în PDF.{" "}
                      <Link href="/account">Completează datele contului</Link>.
                    </p>
                  )}
                </>
              ) : (
                <p role="status">
                  {error ||
                    "Se verifică produsele și se pregătește PDF-ul cu datele contului…"}
                </p>
              )}
              {error && (
                <button
                  className={s.secondary}
                  onClick={() => {
                    setError("");
                    setRevision((r) => r + 1);
                  }}
                >
                  Încearcă din nou
                </button>
              )}
              <div className={s.actions}>
                <button
                  className={s.primary}
                  disabled={!ready}
                  onClick={() => {
                    if (ready) {
                      ready.download(ready.file);
                      setStatus("PDF-ul cererii a fost descărcat.");
                    }
                  }}
                >
                  Generează PDF-ul comenzii
                </button>
                <button
                  className={s.secondary}
                  disabled={!ready || sharing}
                  onClick={share}
                >
                  {sharing ? "Se partajează…" : "Partajează PDF-ul"}
                </button>
              </div>
              <form className={s.email} onSubmit={email}>
                <label>
                  E-mail destinatar
                  <input
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    placeholder="destinatar@exemplu.ro"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                </label>
                <button className={s.primary} disabled={!ready}>
                  Trimite prin e-mail
                </button>
              </form>
              <p className={s.notice}>
                PDF-ul se descarcă automat. Aplicația de e-mail se deschide cu
                destinatarul, subiectul și mesajul în română.{" "}
                <strong>
                  Atașează manual PDF-ul descărcat înainte de a trimite
                  e-mailul.
                </strong>{" "}
                Pentru un atașament direct, încearcă „Partajează PDF-ul” pe un
                dispozitiv compatibil.
              </p>
              {ready && recipient && (
                <a href={mailtoLink(recipient, message)}>
                  Deschide din nou mesajul în aplicația de e-mail
                </a>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

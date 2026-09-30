"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authPost } from "@/lib/auth-client";
import BrandLogo from "@/app/components/BrandLogo";
import NumericInput from "@/app/components/NumericInput";
import { currentAccount, billingFields, type Billing } from "@/lib/account";
import { supabase } from "@/lib/supabase";
import { CARD_COLUMNS, hasArchiveColumn } from "@/lib/catalog-query";
import type { ProductCard } from "@/lib/catalog";
import {
  cartTotals,
  companyDetails,
  lineTotals,
  maxCartBoxes,
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
  company: string[][];
  missing: boolean;
};
export default function CartPage() {
  const cart = useCart();
  const { user } = useStoreSession();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
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
          return { ...line, product, boxes: Math.min(line.boxes, maxCartBoxes(product)) };
        });
        if (!active) return;
        if (
          fresh.some(
            (l, i) =>
              l.product.pret_engros !== lines[i].product.pret_engros ||
              l.product.bucati_per_cutie !==
                lines[i].product.bucati_per_cutie ||
              l.product.nume_produs !== lines[i].product.nume_produs ||
              l.boxes !== lines[i].boxes ||
              l.product.stoc_actual !== lines[i].product.stoc_actual,
          )
        ) {
          // Do not overwrite changes made in another tab while the request was running.
          const storageKey = `toylogix-cart-v1:${account.id}`;
          if (localStorage.getItem(storageKey) === raw) {
            localStorage.setItem(storageKey, JSON.stringify(fresh.filter((line) => line.boxes > 0)));
            window.dispatchEvent(new Event("toylogix-cart"));
            setStatus(
              "Coșul a fost actualizat cu stocul, prețurile și ambalajele curente. Cantitățile sunt limitate la stocul disponibil. Verifică totalurile.",
            );
          }
          return;
        }
        const company = companyDetails(account, (billing || {}) as Billing);
        if (active) {
          setPrepared({
            key,
            company,
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
              : "Cererea nu poate fi pregătită. Încearcă din nou.",
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
  async function submit() {
    if (!ready || submitting || !user) return;
    setSubmitting(true); setError("");
    try {
      const storageKey = `toylogix-request:${user.id}`;
      const payload = JSON.stringify(cart.lines.map(l => ({product_id:l.product.id,boxes:l.boxes,price:l.product.pret_engros,pack:l.product.bucati_per_cutie})));
      let attempt = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!attempt || attempt.payload !== payload) { attempt = {key:crypto.randomUUID(),payload}; localStorage.setItem(storageKey,JSON.stringify(attempt)); }
      const result = await authPost("/api/orders",{key:attempt.key,lines:JSON.parse(payload)},true);
      cart.update(() => []);
      localStorage.removeItem(storageKey);
      router.push(`/store/orders?order=${result.order.id}${result.notificationPending ? "&notifications=pending" : ""}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Cererea nu a fost confirmată.");
    } finally { setSubmitting(false); }
  }
  return (
    <main className={s.page}>
      <div className={s.container}>
        <div className={s.heading}>
          <BrandLogo className={s.logo} />
          <Link href="/store/orders">Comenzile mele</Link>
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
                    <NumericInput
                      aria-label={`Cutii: ${line.product.nume_produs}`}
                      type="number"
                      min="1"
                      max={maxCartBoxes(line.product)}
                      step="1"
                      value={line.boxes}
                      onChange={(e) => {
                        const boxes = Number(e.target.value);
                        if (
                          Number.isInteger(boxes) &&
                          boxes > 0
                        )
                          cart.update((rows) =>
                            rows.map((l) =>
                              l.product.id === line.product.id
                                ? { ...l, boxes: Math.min(boxes, maxCartBoxes(l.product)) }
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
                    "Se verifică produsele și datele contului…"}
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
              {error && <p role="alert" className={s.notice}>{error}</p>}
              <div className={s.actions}>
                <button className={s.primary} disabled={!ready || submitting} onClick={submit}>
                  {submitting ? "Se trimite cererea…" : "Trimite cererea de comandă"}
                </button>
                <Link href="/store/orders">Comenzile mele</Link>
              </div>
              <p className={s.muted}>Cererea și rezumatul PDF sunt trimise automat către tine și ToyLogix. Plata se efectuează prin transfer bancar după aprobare.</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

"use client";
import type { InventorySummary } from "@/lib/inventory-query";

import { useEffect, useState } from "react";
import {
  listStockMovements,
  MOVEMENT_PAGE_SIZE,
  recordStockMovement,
  reverseStockMovement,
} from "@/lib/stock";
import {
  movementLabels,
  stockError,
  type MovementType,
  type StockMovement,
} from "@/lib/stock-rules";
import { supabase } from "@/lib/supabase";
import { INVENTORY_SUMMARY_COLUMNS } from "@/lib/inventory-query";
import { searchPattern } from "@/lib/catalog-query";
import dashboard from "./dashboard.module.css";
import styles from "./stock.module.css";

type Props = {
  selectedId: number | null;
  selectProduct: (id: number | null) => void;
  refreshProducts: () => Promise<void>;
};

export default function StockManagement({
  selectedId,
  selectProduct,
  refreshProducts,
}: Props) {
  const [products, setProducts] = useState<InventorySummary[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [productCount, setProductCount] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<InventorySummary | undefined>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [filterType, setFilterType] = useState<MovementType | "">("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    movements: StockMovement[];
    count: number;
  }>({ movements: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [type, setType] =
    useState<Exclude<MovementType, "reversal">>("stock_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [reversing, setReversing] = useState<StockMovement | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const product = selectedProduct;
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    async function load() {
      let query = supabase.from("inventory_products").select(INVENTORY_SUMMARY_COLUMNS, { count: "exact" });
      if (productSearch.trim()) query = query.or(`nume_produs.ilike.${searchPattern(productSearch)},cod_bara.ilike.${searchPattern(productSearch)}`);
      const { data, count, error } = await query.order("id", { ascending: false }).range((productPage-1)*24, productPage*24-1).abortSignal(signal).overrideTypes<InventorySummary[], { merge: false }>();
      if (error) throw error;
      const selected = selectedId ? await supabase.from("inventory_products").select(INVENTORY_SUMMARY_COLUMNS).eq("id", selectedId).abortSignal(signal).single().overrideTypes<InventorySummary, { merge: false }>() : null;
      if (selected?.error) throw selected.error;
      if (!controller.signal.aborted) { setProducts(data ?? []); setProductCount(count ?? 0); setSelectedProduct(selected?.data ?? undefined); }
    }
    const timer = setTimeout(() => void load().catch(() => { if (!controller.signal.aborted) setLoadError("Produsele nu pot fi încărcate."); }),250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selectedId, productSearch, productPage, revision]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await listStockMovements(
          {
            productId: selectedId ?? undefined,
            from,
            to,
            userId,
            type: filterType || undefined,
            page,
          },
          controller.signal,
        );
        if (!controller.signal.aborted) setResult(data);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(stockError(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [selectedId, from, to, userId, filterType, page, revision]);

  async function saveMovement(event: React.FormEvent) {
    event.preventDefault();
    if (!product?.id || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await recordStockMovement({
        productId: product.id,
        type,
        amount: Number(amount),
        currentStock: product.stoc_actual,
        reason,
        notes,
      });
      setAmount("");
      setReason("");
      setNotes("");
      setMessage("Mișcarea a fost înregistrată.");
    } catch (error) {
      setMessage(stockError(error));
    } finally {
      await refreshProducts();
      setPage(0);
      setRevision((value) => value + 1);
      setBusy(false);
    }
  }

  async function reverse(event: React.FormEvent) {
    event.preventDefault();
    const { data: target } = await supabase.from("inventory_products").select(INVENTORY_SUMMARY_COLUMNS).eq("id", reversing?.product_id ?? 0).single().overrideTypes<InventorySummary, { merge: false }>();
    if (!reversing || !target || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await reverseStockMovement(reversing, target.stoc_actual, reversalReason);
      setReversing(null);
      setReversalReason("");
      setMessage(
        "Stornarea a fost înregistrată. Mișcarea originală a fost păstrată.",
      );
    } catch (error) {
      setMessage(stockError(error));
    } finally {
      await refreshProducts();
      setPage(0);
      setRevision((value) => value + 1);
      setBusy(false);
    }
  }

  return (
    <section
      id="stock-management"
      className={`${dashboard.section} ${styles.panel}`}
      aria-labelledby="stock-title"
    >
      <h2 id="stock-title">Stoc și istoric mișcări</h2>
      <div className={styles.filters}>
        <label>
          Produs
          <input placeholder="Caută produs sau cod" value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} />
          <span><button disabled={productPage===1} onClick={() => setProductPage(productPage-1)}>Înapoi</button> {productPage} / {Math.max(1,Math.ceil(productCount/24))} <button disabled={productPage*24>=productCount} onClick={() => setProductPage(productPage+1)}>Înainte</button></span>
          <select
            value={selectedId ?? ""}
            disabled={busy}
            onChange={(e) => {
              selectProduct(e.target.value ? Number(e.target.value) : null);
              setPage(0);
              setReversing(null);
              setReason("");
              setAmount("");
              setNotes("");
              setMessage("");
            }}
          >
            <option value="">Toate produsele</option>
            {[...new Map([...(selectedProduct ? [selectedProduct] : []), ...products].map((item) => [item.id,item])).values()].map((item) => (
              <option key={item.id} value={item.id}>
                {item.nume_produs}
                {item.is_archived ? " (arhivat)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          De la
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Până la
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Utilizator (ID)
          <input
            value={userId}
            placeholder="Toți utilizatorii"
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Tip operațiune
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as MovementType | "");
              setPage(0);
            }}
          >
            <option value="">Toate tipurile</option>
            {Object.entries(movementLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {product && (
        <div className={styles.detail}>
          <h3>
            {product.nume_produs} — {product.cod_bara}
          </h3>
          <p>
            Stoc: <strong>{product.stoc_actual}</strong> · Prag critic:{" "}
            {product.critical_stock_level ?? product.stoc_critic} · Sold
            inițial: {product.opening_stock ?? 0}
          </p>
          <p>
            {product.categorie} · {product.brand} · {product.pret_engros} RON
          </p>
          {product.is_archived ? (
            <p>
              Produs arhivat. Istoricul este păstrat; reactivați produsul pentru
              operațiuni.
            </p>
          ) : (
            <form onSubmit={saveMovement} className={styles.form}>
              <label>
                Operațiune
                <select
                  value={type}
                  disabled={busy}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  {Object.entries({ stock_in: movementLabels.stock_in, stock_out: movementLabels.stock_out, return: movementLabels.return, count_adjustment: movementLabels.count_adjustment })
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {type === "count_adjustment"
                  ? "Diferență (+ / −), nu stocul final"
                  : "Cantitate (pozitivă)"}
                <input
                  type="number"
                  step="1"
                  min={type === "count_adjustment" ? -2147483647 : 1}
                  max="2147483647"
                  required
                  value={amount}
                  disabled={busy}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                Motiv obligatoriu
                <input
                  required
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                Note (opțional)
                <input
                  value={notes}
                  disabled={busy}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <p>
                Data și utilizatorul sunt înregistrate automat. Stocul negativ
                este interzis.
              </p>
              <button disabled={busy} type="submit">
                {busy ? "Se salvează…" : "Înregistrează mișcarea"}
              </button>
            </form>
          )}
          <a href="#stock-history">Vezi istoricul produsului ↓</a>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {reversing && (
        <form className={styles.detail} onSubmit={reverse}>
          <h3>
            Stornare: {movementLabels[reversing.movement_type]} (
            {reversing.quantity})
          </h3>
          <p>
            Produs:{" "}
            {
              products.find((item) => item.id === reversing.product_id)
                ?.nume_produs
            }{" "}
            · Efect: {-reversing.quantity} · {reversing.reason}
          </p>
          <label>
            Motivul stornării
            <input
              autoFocus
              required
              value={reversalReason}
              disabled={busy}
              onChange={(e) => setReversalReason(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Confirmă stornarea
          </button>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => setReversing(null)}
          >
            Anulează
          </button>
        </form>
      )}
      <h3 id="stock-history">Istoric mișcări</h3>
      {loadError ? (
        <p role="alert">
          {loadError}{" "}
          <button onClick={() => setRevision((value) => value + 1)}>
            Reîncarcă
          </button>
        </p>
      ) : loading ? (
        <p role="status">Se încarcă istoricul…</p>
      ) : (
        <>
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Produs</th>
                  <th>Data</th>
                  <th>Utilizator</th>
                  <th>Tip</th>
                  <th>Cantitate</th>
                  <th>Motiv / Note</th>
                  <th>Stornare</th>
                </tr>
              </thead>
              <tbody>
                {result.movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>
                      {movement.product_name ?? movement.product_id}
                    </td>
                    <td>
                      {new Date(movement.created_at).toLocaleString("ro-RO")}
                    </td>
                    <td title={movement.created_by}>
                      {movement.actor_name ?? movement.created_by}
                    </td>
                    <td>{movementLabels[movement.movement_type]}</td>
                    <td>
                      {movement.quantity > 0 ? "+" : ""}
                      {movement.quantity}
                    </td>
                    <td>
                      {movement.reason}
                      {movement.notes && <p>{movement.notes}</p>}
                      <small>ID: {movement.id}</small>
                    </td>
                    <td>
                      {movement.reversal_of ? (
                        <small>Stornează: {movement.reversal_of}</small>
                      ) : movement.reversed_at ? (
                        <>
                          Stornată la{" "}
                          {new Date(movement.reversed_at).toLocaleString(
                            "ro-RO",
                          )}
                        </>
                      ) : (
                        <button
                          disabled={
                            busy ||
                            !!products.find(
                              (item) => item.id === movement.product_id,
                            )?.is_archived
                          }
                          onClick={() => {
                            setReversing(movement);
                            setReversalReason("");
                          }}
                        >
                          Stornează
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.count && <p>Nu există mișcări pentru filtrele selectate.</p>}
          <div className={styles.pagination}>
            <button
              disabled={page === 0 || busy}
              onClick={() => setPage((value) => value - 1)}
            >
              Înapoi
            </button>
            <span>
              Pagina {page + 1} · {result.count} mișcări
            </span>
            <button
              disabled={(page + 1) * MOVEMENT_PAGE_SIZE >= result.count || busy}
              onClick={() => setPage((value) => value + 1)}
            >
              Înainte
            </button>
            <button
              disabled={loading || busy}
              onClick={() => setRevision((value) => value + 1)}
            >
              Reîncarcă
            </button>
          </div>
        </>
      )}
    </section>
  );
}

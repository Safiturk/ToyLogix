import { useEffect, useState } from "react";
import Image from "next/image";
import type { InventoryProduct } from "./models";
import { supabase } from "@/lib/supabase";
import { hasArchiveColumn, productPageQuery } from "@/lib/catalog-query";
import dashboard from "./dashboard.module.css";
import ui from "./inventory.module.css";

type Props = {
  enabled: boolean;
  refreshVersion: number;
  editProduct: (product: { id?: number }) => void;
  archiveProduct: (id: number, archived: boolean) => void;
  showHistory: (id: number) => void;
};
export default function ProductInventory({
  enabled,
  refreshVersion,
  editProduct,
  archiveProduct,
  showHistory,
}: Props) {
  const [archiveFilter, setArchiveFilter] = useState<
    "active" | "archived" | "all"
  >("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [products, setProducts] = useState<Omit<InventoryProduct, "gen">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const archiveAvailable = await hasArchiveColumn(
          supabase,
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        const { data, count, error } = await productPageQuery(
          supabase,
          { query: search, archive: archiveFilter, page, pageSize },
          true,
          archiveAvailable,
        )
          .abortSignal(
            AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          )
          .overrideTypes<Omit<InventoryProduct, "gen">[], { merge: false }>();
        if (controller.signal.aborted) return;
        if (error) throw error;
        const last = Math.max(1, Math.ceil((count ?? 0) / pageSize));
        if (page > last) {
          setPage(last);
          return;
        }
        setProducts(data ?? []);
        setTotal(count ?? 0);
      } catch {
        if (!controller.signal.aborted)
          setError("Inventarul nu poate fi incarcat.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, archiveFilter, search, page, refreshVersion, retry]);
  return (
    <section className={`${dashboard.section} ${dashboard.inventory} ${ui.inventory}`}>
      <h2 className="text-xl font-bold text-slate-800">
        Inventar Produse ({total})
      </h2>
      <div className={ui.toolbar}>
      <label>
        Stare produse{" "}
        <select
          className={ui.control}
          value={archiveFilter}
          onChange={(e) => {
            setArchiveFilter(e.target.value as typeof archiveFilter);
            setPage(1);
            setLoading(true);
          }}
        >
          <option value="active">Active</option>
          <option value="archived">Arhivate</option>
          <option value="all">Toate</option>
        </select>
      </label>

      <label className={ui.search}>
        Cauta produse{" "}
        <input
          className={ui.control}
          placeholder="Nume produs sau cod de bare"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
            setLoading(true);
          }}
        />
      </label>
      </div>
      {loading ? (
        <p role="status">Se incarca inventarul…</p>
      ) : error ? (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((value) => value + 1)}>
            Reincearca
          </button>
        </p>
      ) : (
        <>
          <div className={ui.tableScroll}>
            <table className={ui.table}>
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-bold text-slate-600">
                  <th className="p-3">Imagine</th>
                  <th className="p-3">Produs</th>
                  <th className="p-3">Categorie</th>
                  <th className="p-3">Pret B2B</th>
                  <th className="p-3">Pret recomandat</th>
                  <th className="p-3">Stoc</th>
                  <th className="p-3">Actiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="w-10 h-10 rounded-lg border overflow-hidden bg-slate-100">
                        <Image
                          width={40}
                          height={40}
                          unoptimized
                          src={
                            product.imagini && product.imagini.length > 0
                              ? product.imagini[0]
                              : "/toylogix-logo.svg"
                          }
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </td>
                    <td className="p-3 font-bold">
                      <button
                        className={ui.productName}
                        title="Vezi detalii si istoric stoc"
                        onClick={() => product.id && showHistory(product.id)}
                      >
                        {product.nume_produs}
                      </button>
                      <small className={ui.barcode}>{product.cod_bara || "Fara cod de bare"}</small>
                      {product.is_archived && (
                        <span className="block text-slate-500">Arhivat</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={ui.category}>
                        {product.categorie}
                      </span>
                    </td>
                    <td className={ui.price}>
                      {product.pret_engros} RON
                    </td>
                    <td className={ui.price}>
                      {product.pret_retail} RON
                    </td>
                    <td className="p-3">
                      <span
                        className={`${ui.stock} ${product.stoc_actual <= product.stoc_critic ? ui.lowStock : ""}`}
                      >
                        {product.stoc_actual} buc
                      </span>
                    </td>
                    <td className={ui.actionsCell}>
                      <button
                        onClick={() => editProduct(product)}
                        className={ui.edit}
                      >
                        Editeaza
                      </button>
                      <button
                        onClick={() =>
                          product.id &&
                          archiveProduct(product.id, !product.is_archived)
                        }
                        className={ui.archive}
                      >
                        {product.is_archived ? "Reactiveaza" : "Arhiveaza"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {products.length === 0 && <p className={ui.empty}>Nu exista produse pentru filtrele selectate.</p>}
          {pageCount > 1 && <nav
            aria-label="Paginare inventar"
            className={dashboard.pagination}
          >
            <button
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
                setLoading(true);
              }}
            >
              Inapoi
            </button>
            <span>
              Pagina {page} din {pageCount} · {total} produse
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => {
                setPage(page + 1);
                setLoading(true);
              }}
            >
              Inainte
            </button>
          </nav>}
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import Image from "next/image";
import type { InventoryProduct } from "./models";
import { supabase } from "@/lib/supabase";
import { hasArchiveColumn, productPageQuery } from "@/lib/catalog-query";
import dashboard from "./dashboard.module.css";

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
          setError("Inventarul nu poate fi încărcat.");
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
    <section className={`${dashboard.section} ${dashboard.inventory}`}>
      <h2 className="text-xl font-bold text-slate-800">
        Inventar Produse ({total})
      </h2>
      <label className="block my-3 text-sm">
        Stare produse{" "}
        <select
          className="border rounded p-2"
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

      <label className="block my-3 text-sm">
        Caută produse{" "}
        <input
          className="border rounded p-2"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
            setLoading(true);
          }}
        />
      </label>
      {loading ? (
        <p role="status">Se încarcă inventarul…</p>
      ) : error ? (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((value) => value + 1)}>
            Reîncearcă
          </button>
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-bold text-slate-600">
                  <th className="p-3">Imagine</th>
                  <th className="p-3">Cod Bare</th>
                  <th className="p-3">Produs</th>
                  <th className="p-3">Categorie</th>
                  <th className="p-3">Preț B2B (En-Gros)</th>
                  <th className="p-3">Preț Recomandat (RRP)</th>
                  <th className="p-3">Stoc</th>
                  <th className="p-3">Acțiuni</th>
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
                    <td className="p-3 font-mono">{product.cod_bara}</td>
                    <td className="p-3 font-bold">
                      <button
                        className="text-indigo-700 underline"
                        onClick={() => product.id && showHistory(product.id)}
                      >
                        {product.nume_produs}
                      </button>
                      {product.is_archived && (
                        <span className="block text-slate-500">Arhivat</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
                        {product.categorie}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-indigo-600">
                      {product.pret_engros} RON
                    </td>
                    <td className="p-3 text-slate-500 font-medium">
                      {product.pret_retail} RON
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded font-bold ${
                          product.stoc_actual <= product.stoc_critic
                            ? "bg-rose-100 text-rose-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {product.stoc_actual} buc
                      </span>
                    </td>
                    <td className="p-3 flex gap-2">
                      <button
                        onClick={() => editProduct(product)}
                        className="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 font-bold transition"
                      >
                        Editează
                      </button>
                      <button
                        onClick={() =>
                          product.id &&
                          archiveProduct(product.id, !product.is_archived)
                        }
                        className="px-3 py-1 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-bold transition"
                      >
                        {product.is_archived ? "Reactivează" : "Arhivează"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            aria-label="Paginare inventar"
            className="flex gap-4 items-center my-4"
          >
            <button
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
                setLoading(true);
              }}
            >
              Înapoi
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
              Înainte
            </button>
          </nav>
        </>
      )}
    </section>
  );
}

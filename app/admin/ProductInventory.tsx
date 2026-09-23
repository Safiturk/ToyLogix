import { useState } from "react";
import type { InventoryProduct } from "./models";
import dashboard from "./dashboard.module.css";

type Props = {
  products: InventoryProduct[];
  editProduct: (product: InventoryProduct) => void;
  archiveProduct: (id: number, archived: boolean) => void;
  showHistory: (id: number) => void;
};
export default function ProductInventory({
  products,
  editProduct,
  archiveProduct,
  showHistory,
}: Props) {
  const [archiveFilter, setArchiveFilter] = useState("active");
  const visibleProducts = products.filter(
    (product) =>
      archiveFilter === "all" ||
      (archiveFilter === "archived"
        ? product.is_archived
        : !product.is_archived),
  );
  return (
    <section className={`${dashboard.section} ${dashboard.inventory}`}>
      <h2 className="text-xl font-bold text-slate-800">
        Inventar Produse ({visibleProducts.length})
      </h2>
      <label className="block my-3 text-sm">
        Stare produse{" "}
        <select
          className="border rounded p-2"
          value={archiveFilter}
          onChange={(e) => setArchiveFilter(e.target.value)}
        >
          <option value="active">Active</option>
          <option value="archived">Arhivate</option>
          <option value="all">Toate</option>
        </select>
      </label>

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
            {visibleProducts.map((product) => (
              <tr key={product.id} className="hover:bg-slate-50">
                <td className="p-3">
                  <div className="w-10 h-10 rounded-lg border overflow-hidden bg-slate-100">
                    <img
                      src={
                        product.imagini && product.imagini.length > 0
                          ? product.imagini[0]
                          : "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=100&q=80"
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
    </section>
  );
}

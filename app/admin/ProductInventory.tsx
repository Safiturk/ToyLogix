import type { InventoryProduct } from "./models";
import dashboard from "./dashboard.module.css";

type Props = {
  products: InventoryProduct[];
  editProduct: (product: InventoryProduct) => void;
  deleteProduct: (id: number) => void;
};
export default function ProductInventory({
  products,
  editProduct,
  deleteProduct,
}: Props) {
  return (
    <section className={`${dashboard.section} ${dashboard.inventory}`}>
      <h2 className="text-xl font-bold text-slate-800">
        Inventar Produse ({products.length})
      </h2>

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
                <td className="p-3 font-bold">{product.nume_produs}</td>
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
                    onClick={() => product.id && deleteProduct(product.id)}
                    className="px-3 py-1 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-bold transition"
                  >
                    Șterge
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

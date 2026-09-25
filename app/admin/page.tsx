"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import BarcodeScanner from "../components/BarcodeScanner";
import formStyles from "./product-form.module.css";
import OnlinePanel from "./OnlinePanel";
import wings from "./wings.module.css";
import dashboard from "./dashboard.module.css";
import { currentAccount, accountColumns, signOutAccount } from "@/lib/account";
import CustomerDetails from "./CustomerDetails";
import {
  loadInventorySummary,
  type InventorySummary,
  type InventoryStats,
  loadInventoryStats,
  INVENTORY_SUMMARY_COLUMNS,
} from "@/lib/inventory-query";
import { DETAIL_COLUMNS, hasArchiveColumn, loadFacet } from "@/lib/catalog-query";
import { uploadProductImage, isProductImageUrl } from "@/lib/product-storage";
import ProductInventory from "./ProductInventory";
import StockManagement from "./StockManagement";
import AuditHistory from "./AuditHistory";
import { authPost } from "@/lib/auth-client";
import { archiveProduct as setProductArchived, recordStockMovement } from "@/lib/stock";
import { productMetadata, stockError } from "@/lib/stock-rules";
import {
  type InventoryProduct,
  type AdminAccount,
  createProductDraft,
} from "./models";

const DEFAULT_CATEGORIES = [
  "Bebelusi",
  "Masini",
  "Jocuri de Societate",
  "Papusi",
  "Puzzle",
  "Seturi de Constructie",
  "Carti",
];

function SimplePagination({ page, count, size, change, label }: { page: number; count: number; size: number; change: (page: number) => void; label: string }) {
  const last = Math.max(1, Math.ceil(count/size));
  return <nav aria-label={label} className="flex gap-4"><span>{label}: {count}</span><button disabled={page===1} onClick={() => change(page-1)}>Înapoi</button><span>{page} / {last}</span><button disabled={page>=last} onClick={() => change(page+1)}>Înainte</button></nav>;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<InventoryStats>({ products: 0, stock: 0, retail: 0, wholesale: 0, critical: 0 });
  const [criticalStockProducts, setCriticalProducts] = useState<InventorySummary[]>([]);
  const [criticalPage, setCriticalPage] = useState(1);
  const [facets, setFacets] = useState({ categorie: [] as string[], brand: [] as string[], material: [] as string[], varsta_recomandata: [] as string[] });
  const [pendingUsers, setPendingUsers] = useState<AdminAccount[]>([]);
  const [accountPage, setAccountPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [accountCount, setAccountCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [accountVersion, setAccountVersion] = useState(0);
  const [accountError, setAccountError] = useState("");
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [stockProductId, setStockProductId] = useState<number | null>(null);
  const [productLoadError, setProductLoadError] = useState("");
  const [auditVersion, setAuditVersion] = useState(0);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<AdminAccount | null>(null);
  const [detailUser, setDetailUser] = useState<AdminAccount | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  const [isUserTableOpen, setIsUserTableOpen] = useState(false);

  const [uploadingImages, setUploadingImages] = useState(false);

  const [form, setForm] = useState<InventoryProduct>(createProductDraft);

  useEffect(() => {
    let active = true;
    void currentAccount()
      .then(async (profile) => {
        if (!active) return;
        if (
          !profile ||
          profile.rol !== "admin" ||
          profile.status !== "approved"
        ) {
          router.replace("/store");
          return;
        }
        setCurrentUser(profile);

      })
      .catch(() => {
        if (active) router.replace("/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void Promise.all([
      loadInventoryStats(supabase, signal),
      supabase.from("inventory_products").select(INVENTORY_SUMMARY_COLUMNS, { count: "exact" })
        .eq("is_archived", false).eq("stock_is_critical", true).order("id", { ascending: false })
        .range((criticalPage - 1) * 12, criticalPage * 12 - 1).abortSignal(signal)
        .overrideTypes<InventorySummary[], { merge: false }>(),
      Promise.all((["categorie", "brand", "material", "varsta_recomandata"] as const).map((field) => loadFacet(supabase, field, signal))),
    ]).then(([totals, critical, options]) => {
      if (controller.signal.aborted) return;
      if (critical.error) throw critical.error;
      const last = Math.max(1, Math.ceil((critical.count ?? 0) / 12));
      if (criticalPage > last) { setCriticalPage(last); return; }
      setStats(totals); setCriticalProducts(critical.data ?? []);
      setFacets({ categorie: options[0], brand: options[1], material: options[2], varsta_recomandata: options[3] });
      setProductLoadError("");
    }).catch(() => { if (!controller.signal.aborted) setProductLoadError("Inventarul nu poate fi încărcat."); });
    return () => controller.abort();
  }, [currentUser, inventoryVersion, criticalPage]);

  useEffect(() => {
    if (!currentUser) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void Promise.all([
      supabase.from("utilizatori").select(accountColumns, { count: "exact" }).order("id", { ascending: false }).range((accountPage-1)*24, accountPage*24-1).abortSignal(signal).overrideTypes<AdminAccount[], { merge: false }>(),
      supabase.from("utilizatori").select(accountColumns, { count: "exact" }).eq("status", "pending").order("id", { ascending: false }).range((pendingPage-1)*12, pendingPage*12-1).abortSignal(signal).overrideTypes<AdminAccount[], { merge: false }>(),
    ]).then(([registered, pending]) => {
      if (controller.signal.aborted) return;
      if (registered.error || pending.error) throw registered.error || pending.error;
      setAccounts(registered.data ?? []); setAccountCount(registered.count ?? 0);
      setPendingUsers(pending.data ?? []); setPendingCount(pending.count ?? 0); setAccountError("");
      setAccountPage((page) => Math.min(page, Math.max(1, Math.ceil((registered.count ?? 0)/24))));
      setPendingPage((page) => Math.min(page, Math.max(1, Math.ceil((pending.count ?? 0)/12))));
    }).catch(() => { if (!controller.signal.aborted) setAccountError("Conturile nu pot fi încărcate."); });
    return () => controller.abort();
  }, [currentUser, accountVersion, accountPage, pendingPage]);

  const refreshProducts = async () => { setInventoryVersion((value) => value + 1); };
  const refreshAccounts = async () => { setAccountVersion((value) => value + 1); setAuditVersion((value) => value + 1); };

  const updateAccountStatus = async (
    id: number,
    status: "approved" | "rejected",
  ) => {
    const { error } = await supabase
      .from("utilizatori")
      .update({ status })
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      alert(
        "Modificarea nu a fost salvată. Verifică permisiunile și conexiunea.",
      );
      return;
    }
    alert(
      `Utilizatorul a fost ${status === "approved" ? "Aprobat" : "Respins"}!`,
    );
    refreshAccounts();
  };

  const accountAction = async (
    user: AdminAccount,
    action: "access" | "profile" | "account",
  ) => {
    if (accountBusy || currentUser?.id === user.id) return;
    const prompt =
      action === "access"
        ? user.is_active
          ? "Închizi accesul? Datele sunt păstrate; accesul poate fi redeschis."
          : "Redeschizi accesul? Rolul și aprobarea rămân neschimbate."
        : action === "profile"
          ? "Ștergi profilul? Accesul este oprit. Contul de autentificare, facturarea și istoricul sunt păstrate."
          : "Ștergi definitiv contul de autentificare și profilul? Datele de facturare vor fi eliminate. Istoricul protejat poate împiedica ștergerea.";
    if (!confirm(user.email + "\n" + prompt)) return;
    setAccountBusy(true);
    try {
      if (action === "account")
        await authPost(
          "/api/admin/accounts/delete",
          { profileId: user.id },
          true,
        );
      else {
        const { error } =
          action === "access"
            ? await supabase.rpc("deactivate_account", {
                p_target_id: user.id,
                p_disabled: user.is_active,
              })
            : await supabase.rpc("delete_profile", { p_target_id: user.id });
        if (error) throw error;
      }
      setDetailUser(null);
      await refreshAccounts();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Operațiunea nu a reușit. Verifică accesul și conexiunea.",
      );
      await refreshAccounts();
    } finally {
      setAccountBusy(false);
    }
  };

  const toggleAccountRole = async (user: AdminAccount) => {
    if (currentUser && currentUser.email === user.email) {
      alert("Nu vă puteți schimba propriul rol!");
      return;
    }

    const newRole = user.rol === "admin" ? "user" : "admin";
    const { error } = await supabase
      .from("utilizatori")
      .update({ rol: newRole })
      .eq("id", user.id)
      .select("id")
      .single();
    if (error) {
      alert(
        "Rolul nu a fost modificat. Numai un administrator autorizat poate schimba accesul.",
      );
      return;
    }
    alert(`Rolul utilizatorului a fost schimbat în: ${newRole.toUpperCase()}`);
    refreshAccounts();
  };

  const appendProductImage = (image: string) => {
    setForm((draft) => ({
      ...draft,
      imagini: [...(draft.imagini || []), image],
    }));
  };

  const handleLocalFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (uploadingImages || !files.length) return;
    if (files.length + (form.imagini?.length ?? 0) > 10) { alert("Maximum 10 imagini per produs."); return; }
    setUploadingImages(true);
    try { for (const file of files) appendProductImage(await uploadProductImage(file)); }
    catch (error) { alert(error instanceof Error ? error.message : "Încărcarea a eșuat."); }
    finally { setUploadingImages(false); }
  };

  const removeImageFromForm = (index: number) => {
    setForm((prev) => ({
      ...prev,
      imagini: prev.imagini?.filter((_, i) => i !== index),
    }));
  };

  const editProduct = async (p: { id?: number }) => {
    if (!p.id) return;
    try {
      const archiveAvailable = await hasArchiveColumn(
        supabase,
        AbortSignal.timeout(15000),
      );
      const columns = archiveAvailable
        ? DETAIL_COLUMNS
        : DETAIL_COLUMNS.replace(",is_archived", "");
      const { data, error } = await supabase
        .from("produse")
        .select(columns)
        .eq("id", p.id)
        .abortSignal(AbortSignal.timeout(15000))
        .single()
        .overrideTypes<InventoryProduct, { merge: false }>();
      if (error || !data) {
        alert("Produsul nu poate fi încărcat pentru editare.");
        return;
      }
      setEditingId(data.id || null);
      setForm({
        ...data,
        imagini: data.imagini || [],
        descriere: data.descriere || "",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      alert("Produsul nu poate fi încărcat pentru editare.");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(createProductDraft());
    setIsCustomCategory(false);
  };

  const archiveProduct = async (id: number, archived: boolean) => {
    try {
      await setProductArchived(id, archived);
      await refreshProducts();
    } catch (error) {
      alert(stockError(error));
    }
  };

  const showStockHistory = (id: number) => {
    setStockProductId(id);
    document
      .getElementById("stock-management")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProduct || uploadingImages) return;
    if (!editingId && (!Number.isSafeInteger(form.stoc_actual) || form.stoc_actual < 0 || form.stoc_actual > 2147483647)) {
      alert("Stocul trebuie să fie un număr întreg între 0 și 2147483647.");
      return;
    }
    if (form.imagini?.some((image) => !isProductImageUrl(image))) { alert("Încărcați imaginile în Storage înainte de salvare."); return; }
    setSavingProduct(true);
    const metadata = productMetadata({ ...form });
    try {
      const { data, error } = editingId
        ? await supabase.from("produse").update(metadata).eq("id", editingId).select("id").single()
        : await supabase.from("produse").insert([metadata]).select("id").single();
      if (error) throw error;
      if (!editingId && form.stoc_actual > 0) {
        try {
          await recordStockMovement({
            productId: data.id,
            type: "stock_in",
            amount: form.stoc_actual,
            currentStock: 0,
            reason: "Stoc inițial la adăugarea produsului",
          });
        } catch (stockFailure) {
          // The product exists even if the separate stock request fails.
          // Clear the creation form so retrying cannot create a duplicate.
          cancelEdit();
          await refreshProducts();
          showStockHistory(data.id);
          alert("Produsul a fost creat, dar stocul inițial nu a fost confirmat. Verifică istoricul înainte de a înregistra o nouă intrare. " + stockError(stockFailure));
          return;
        }
      }
      alert(
        editingId ? "Produs actualizat cu succes!" : "Produs salvat cu succes!",
      );
      cancelEdit();
      await refreshProducts();
    } catch (error) {
      alert(stockError(error));
    } finally {
      setSavingProduct(false);
    }
  };

  const exportToExcel = async () => {
    if (exporting || stats.products === 0) return;
    setExporting(true);
    try {
      const { createInventoryReport } = await import("@/lib/inventory-report");
      const products = await loadInventorySummary(supabase, AbortSignal.timeout(60000));
      const buffer = await createInventoryReport(products);
      const blob = new Blob([Uint8Array.from(new Uint8Array(buffer))], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Inventar_ToyLogix.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      alert("Raportul Excel nu a putut fi creat. Încercați din nou.");
    } finally {
      setExporting(false);
    }
  };

  const allCategoryOptions = Array.from(new Set([...DEFAULT_CATEGORIES, ...facets.categorie]));
  const existingBrandOptions = facets.brand;
  const registeredUsers = accounts;
  const totalStockItems = stats.stock;
  const totalRetailValue = stats.retail;
  const totalEngrosValue = stats.wholesale;
  const formatRON = (amount: number) => {
    return new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className={dashboard.page}>
      <div className={wings.layout}>
        <div className={`${wings.center} max-w-6xl mx-auto space-y-8`}>
          <header className={dashboard.header}>
            <Link href="/store" className={dashboard.brand}>
              <div className={dashboard.brandMark}>T</div>
              <div>
                <h1>Panou de Administrare</h1>
                <p className="text-xs text-slate-500 font-medium">
                  ToyLogix Store &bull; Click logo pentru a reveni la Magazin
                </p>
              </div>
            </Link>

            <div className={dashboard.actions}>
              <button
                onClick={exportToExcel}
                disabled={exporting || stats.products === 0}
                className={dashboard.action}
              >
                {exporting ? "Se pregătește…" : "📊 Raport Excel"}
              </button>
              <Link
                href="/store"
                className={`${dashboard.action} ${dashboard.primary}`}
              >
                Magazin
              </Link>
              <button
                onClick={async () => {
                  await signOutAccount();
                  router.replace("/login");
                }}
                className={`${dashboard.action} ${dashboard.exit}`}
              >
                Ieșire Admin
              </button>
            </div>
          </header>

          <section className={dashboard.stats}>
            <div className={dashboard.stat}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total Produse
              </span>
              <div className="text-2xl font-black text-slate-900">
                {stats.products} tipuri
              </div>
            </div>

            <div className={dashboard.stat}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Bucăți în Stoc
              </span>
              <div className="text-2xl font-black text-indigo-600">
                {formatRON(totalStockItems)} buc
              </div>
            </div>

            <div className={dashboard.stat}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Valoare Inventar (B2B)
              </span>
              <div className="text-2xl font-black text-emerald-600">
                {formatRON(totalEngrosValue)} RON
              </div>
              <span className="text-[10px] text-slate-400 block font-medium">
                Valoare RRP: {formatRON(totalRetailValue)} RON
              </span>
            </div>

            <div className={dashboard.stat}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Stoc Critic
              </span>
              <div
                className={`text-2xl font-black ${criticalStockProducts.length > 0 ? "text-rose-600" : "text-slate-900"}`}
              >
                {stats.critical} produse
              </div>
              <a
                href="#critical-stock"
                className="text-sm text-indigo-700 underline"
              >
                Vezi produsele
              </a>
            </div>
          </section>

          {productLoadError && (
            <p role="alert">
              {productLoadError}{" "}
              <button onClick={refreshProducts}>Reîncarcă</button>
            </p>
          )}
          <section id="critical-stock" className={dashboard.section}>
            <h2 className="text-xl font-bold">Produse cu stoc critic</h2>
            {criticalStockProducts.length ? (
              <ul className="mt-3 space-y-2">
                {criticalStockProducts.map((product) => (
                  <li key={product.id}>
                    <button
                      className="text-indigo-700 underline"
                      onClick={() => product.id && showStockHistory(product.id)}
                    >
                      {product.nume_produs} — {product.stoc_actual} buc (prag:{" "}
                      {product.critical_stock_level ?? product.stoc_critic}) ·
                      Detalii și istoric
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nu există produse cu stoc critic.</p>
            )}
          </section>

          <SimplePagination page={criticalPage} count={stats.critical} size={12} change={setCriticalPage} label="Stoc critic" />
          {accountError && <p role="alert">{accountError} <button onClick={refreshAccounts}>Reîncearcă</button></p>}
          <SimplePagination page={pendingPage} count={pendingCount} size={12} change={setPendingPage} label="Solicitări" />
          <SimplePagination page={accountPage} count={accountCount} size={24} change={setAccountPage} label="Conturi" />
          {pendingUsers.length > 0 && (
            <section className={`${dashboard.section} ${dashboard.pending}`}>
              <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                ⏳ Solicitări Înregistrare Noi ({pendingCount})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs bg-white rounded-2xl overflow-hidden shadow-sm">
                  <thead>
                    <tr className="border-b bg-amber-100/50 font-bold text-amber-900">
                      <th className="p-3">Nume</th>
                      <th className="p-3">Telefon</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Firma</th>
                      <th className="p-3">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold">
                          <button
                            type="button"
                            className="text-violet-700 hover:underline"
                            onClick={() => setDetailUser(u)}
                          >
                            {u.nume_complet}
                          </button>
                        </td>
                        <td className="p-3 font-mono">{u.telefon}</td>
                        <td className="p-3">{u.email}</td>
                        <td className="p-3">{u.nume_firma || "-"}</td>
                        <td className="p-3 flex flex-wrap gap-2">
                          <button
                            disabled={currentUser?.id === u.id || accountBusy}
                            onClick={() => void accountAction(u, "access")}
                          >
                            {u.is_active
                              ? "Închide accesul"
                              : "Redeschide accesul"}
                          </button>
                          <button
                            disabled={currentUser?.id === u.id || accountBusy}
                            onClick={() => void accountAction(u, "profile")}
                          >
                            Șterge profilul
                          </button>
                          {u.status === "rejected" && (
                            <button
                              disabled={currentUser?.id === u.id || accountBusy}
                              onClick={() =>
                                void updateAccountStatus(u.id, "approved")
                              }
                            >
                              Aprobă
                            </button>
                          )}
                          <button
                            onClick={() =>
                              updateAccountStatus(u.id, "approved")
                            }
                            className="px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition"
                          >
                            ✓ Aprobă
                          </button>
                          <button
                            onClick={() =>
                              updateAccountStatus(u.id, "rejected")
                            }
                            className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition"
                          >
                            ✕ Respinge
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className={`${dashboard.section} ${dashboard.accordion}`}>
            <div
              onClick={() => setIsUserTableOpen(!isUserTableOpen)}
              className={dashboard.accordionHeader}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">👥</span>
                <h2 className="text-xl font-bold text-slate-800">
                  Utilizatori Înregistrați{" "}
                  <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-xl font-extrabold ml-1">
                    ({accountCount})
                  </span>
                </h2>
              </div>

              <button className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-base transition-transform duration-300">
                <span
                  className={`transition-transform duration-300 ${isUserTableOpen ? "rotate-180" : "rotate-0"}`}
                >
                  ▼
                </span>
              </button>
            </div>

            {isUserTableOpen && (
              <div className="px-6 pb-6 pt-0 border-t border-slate-100 animate-fadeIn">
                <div className="overflow-x-auto pt-4">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 font-bold text-slate-600">
                        <th className="p-3">Nume & Prenume</th>
                        <th className="p-3">Contact</th>
                        <th className="p-3">Firma</th>
                        <th className="p-3">Rol</th>
                        <th className="p-3">Acțiuni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {registeredUsers.map((u) => {
                        const isSelf = currentUser?.email === u.email;
                        return (
                          <tr key={u.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">
                              <button
                                type="button"
                                className="text-violet-700 hover:underline text-left"
                                onClick={() => setDetailUser(u)}
                              >
                                {u.nume_complet}
                                <span className="block text-[10px] font-normal text-slate-500">
                                  Vezi datele clientului →
                                </span>
                              </button>
                            </td>
                            <td className="p-3">
                              <div>{u.email}</div>
                              <div className="text-slate-400 font-mono text-[11px]">
                                {u.telefon}
                              </div>
                            </td>
                            <td className="p-3 font-medium text-slate-600">
                              {u.nume_firma || "Client Direct"}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                  u.rol === "admin"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {u.rol.toUpperCase()} / {u.status}
                                {!u.is_active && " / Acces închis"}
                              </span>
                            </td>
                            <td className="p-3 flex gap-2">
                              <button
                                disabled={
                                  currentUser?.id === u.id || accountBusy
                                }
                                onClick={() => toggleAccountRole(u)}
                                className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                                  isSelf
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed opacity-50"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                }`}
                              >
                                {u.rol === "admin"
                                  ? "Schimbă în User"
                                  : "Schimbă în Admin"}
                              </button>
                              <button
                                disabled={isSelf}
                                onClick={() => void accountAction(u, "account")}
                                className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                                  isSelf
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed opacity-50"
                                    : "bg-rose-100 hover:bg-rose-200 text-rose-700"
                                }`}
                              >
                                Șterge contul
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className={formStyles.card}>
            <div className={formStyles.heading}>
              <div>
                <p className={formStyles.eyebrow}>TOYLOGIX / CATALOG</p>
                <h2 className="text-xl font-bold text-slate-800">
                  {editingId
                    ? "Editare Produs Existent"
                    : "Adăugare Produs Nou"}
                </h2>
                <p className={formStyles.subtitle}>
                  Detalii, imagini și disponibilitate pentru catalogul tău.
                </p>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-300 transition"
                >
                  Anulează Editarea
                </button>
              )}
            </div>

            <form onSubmit={saveProduct} className={formStyles.form}>
              <div className={formStyles.sectionTitle}>
                <span>01</span>
                <h3>Informații produs</h3>
              </div>
              <div className={formStyles.detailsGrid}>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    Cod Bare (Barcode)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={form.cod_bara}
                      onChange={(e) =>
                        setForm({ ...form, cod_bara: e.target.value })
                      }
                      className="flex-1 p-2.5 border rounded-xl font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      className="px-3 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition flex items-center gap-1 shadow-sm"
                    >
                      Scan
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    Nume Produs
                  </label>
                  <input
                    type="text"
                    required
                    value={form.nume_produs}
                    onChange={(e) =>
                      setForm({ ...form, nume_produs: e.target.value })
                    }
                    className="w-full p-2.5 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">
                    Categorie
                  </label>
                  {!isCustomCategory ? (
                    <div className="flex gap-2">
                      <select
                        value={form.categorie}
                        onChange={(e) => {
                          if (e.target.value === "__NEW__") {
                            setIsCustomCategory(true);
                            setForm({ ...form, categorie: "" });
                          } else {
                            setForm({ ...form, categorie: e.target.value });
                          }
                        }}
                        className="flex-1 p-2.5 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
                      >
                        {allCategoryOptions.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="__NEW__">
                          ➕ Categorie Nouă (Yeni Ekle...)
                        </option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nume categorie nouă..."
                        required
                        value={form.categorie}
                        onChange={(e) =>
                          setForm({ ...form, categorie: e.target.value })
                        }
                        className="flex-1 p-2.5 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-amber-50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(false);
                          setForm({
                            ...form,
                            categorie: allCategoryOptions[0] || "Masini",
                          });
                        }}
                        className="px-3 py-1 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300"
                      >
                        Anulează
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="product-brand"
                    className="block text-xs font-bold mb-1"
                  >
                    Brand (Marcă)
                  </label>
                  <input
                    id="product-brand"
                    name="brand"
                    type="text"
                    list="existing-brands"
                    value={form.brand}
                    onChange={(e) =>
                      setForm({ ...form, brand: e.target.value })
                    }
                    placeholder="Caută sau scrie un brand..."
                    className="w-full p-2.5 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
                    autoComplete="off"
                  />
                  <datalist id="existing-brands">
                    {existingBrandOptions.map((brand) => (
                      <option key={brand} value={brand} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Selectează o marcă existentă sau introdu una nouă.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="product-age"
                    className="block text-xs font-bold mb-1"
                  >
                    Vârstă recomandată
                  </label>
                  <input
                    id="product-age"
                    name="varsta_recomandata"
                    type="text"
                    list="product-age-options"
                    value={form.varsta_recomandata ?? ""}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        varsta_recomandata: e.target.value,
                      }))
                    }
                    placeholder="Selectează sau scrie intervalul de vârstă"
                    className="w-full"
                  />
                  <datalist id="product-age-options">
                    {Array.from(
                      new Set([
                        "0-12 luni",
                        "1-3 ani",
                        "3-6 ani",
                        "6-9 ani",
                        "9-12 ani",
                        "12+ ani",
                        ...facets.varsta_recomandata,
                      ]),
                    ).map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Introdu vârsta indicată pe ambalajul produsului.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="product-material"
                    className="block text-xs font-bold mb-1"
                  >
                    Material
                  </label>
                  <input
                    id="product-material"
                    name="material"
                    type="text"
                    list="product-material-options"
                    value={form.material ?? ""}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        material: e.target.value,
                      }))
                    }
                    placeholder="Selectează sau scrie materialul"
                    className="w-full"
                  />
                  <datalist id="product-material-options">
                    {Array.from(
                      new Set([
                        "Plastic",
                        "Lemn",
                        "Metal",
                        "Textil",
                        "Pluș",
                        "Carton",
                        "Silicon",
                        ...facets.material,
                      ]),
                    ).map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Poți introduce și o combinație, de exemplu: lemn și metal.
                  </p>
                </div>
              </div>

              <div className={formStyles.mediaPanel}>
                <div className={formStyles.sectionTitle}>
                  <span>02</span>
                  <h3>Imagini produs</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-500 font-medium">
                      Încarcă imagini (JPEG, PNG, WebP · maximum 5 MB)
                    </span>
                    <label className="block">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingImages}
                        multiple
                        onChange={handleLocalFileUpload}
                        className="block w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {uploadingImages && <p role="status">Se optimizează și se încarcă imaginile…</p>}
                {form.imagini && form.imagini.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-slate-600 block mb-1">
                      Imagini atașate ({form.imagini.length}):
                    </span>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {form.imagini.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative w-20 h-20 border rounded-lg overflow-hidden group bg-white shadow-sm flex-shrink-0"
                        >
                          <Image
                            width={80}
                            height={80}
                            unoptimized
                            src={img}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImageFromForm(idx)}
                            className="absolute inset-0 bg-rose-600/80 text-white font-bold text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                          >
                            Șterge ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">
                  Descriere Produs (Açıklama)
                </label>
                <textarea
                  rows={3}
                  value={form.descriere || ""}
                  onChange={(e) =>
                    setForm({ ...form, descriere: e.target.value })
                  }
                  placeholder="Detalii despre produs..."
                  className="w-full p-2.5 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className={formStyles.sectionTitle}>
                <span>03</span>
                <h3>Prețuri și stoc</h3>
              </div>
              <div className={formStyles.pricingGrid}>
                <div>
                  <label className="block text-xs font-bold text-indigo-700 mb-1">
                    Preț En-Gros (B2B Toptan Fiyat)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.pret_engros || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        pret_engros: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2.5 border rounded-xl text-xs outline-none font-bold bg-indigo-50/60 border-indigo-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Preț Vânzare Recomandat (RRP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.pret_retail || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        pret_retail: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2.5 border rounded-xl text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">
                    Bucăți / Cutie
                  </label>
                  <input
                    type="number"
                    value={form.bucati_per_cutie || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bucati_per_cutie: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full p-2.5 border rounded-xl text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    Prag stoc critic
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.stoc_critic}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stoc_critic: Number(e.target.value),
                      })
                    }
                    className="w-full p-2.5 border rounded-xl text-xs font-bold bg-amber-50 border-amber-300 outline-none"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Limita sub care produsul este semnalat cu stoc critic.
                  </p>
                </div>
                <div>
                  <label htmlFor="product-stock" className="block text-xs font-bold mb-1">
                    {editingId ? "Stoc actual (bucăți)" : "Stoc inițial (bucăți)"}
                  </label>
                  <input
                    id="product-stock"
                    type="number"
                    min="0"
                    max="2147483647"
                    step="1"
                    required
                    readOnly={!!editingId}
                    disabled={savingProduct}
                    value={form.stoc_actual}
                    onChange={(e) => setForm({ ...form, stoc_actual: Number(e.target.value) })}
                    aria-describedby="product-stock-help"
                    className="w-full p-2.5 border rounded-xl text-xs outline-none"
                  />
                  <p id="product-stock-help" className="mt-2 text-xs text-slate-500">
                    {editingId
                      ? "Pentru modificări, folosește „Stoc și istoric mișcări”."
                      : "Cantitatea disponibilă se înregistrează ca intrare la salvare."}
                  </p>
                  {editingId && (
                    <button type="button" onClick={() => showStockHistory(editingId)} className="mt-2 text-xs font-bold text-violet-700 underline">
                      Modifică stocul
                    </button>
                  )}
                </div>
              </div>

              <div className={formStyles.footer}>
                <p>Verifică informațiile înainte de salvare.</p>
                <button
                  type="submit"
                  disabled={savingProduct || uploadingImages}
                  className={formStyles.saveButton}
                  aria-busy={savingProduct}
                >
                  {savingProduct
                    ? "Se salvează..."
                    : editingId
                      ? "Actualizează Produsul (Güncelle)"
                      : "Salvează Produsul în Sistem"}
                </button>
              </div>
            </form>
          </section>

          <ProductInventory
            refreshVersion={inventoryVersion}
            enabled={Boolean(currentUser)}
            editProduct={editProduct}
            archiveProduct={archiveProduct}
            showHistory={showStockHistory}
          />
          <AuditHistory refreshVersion={auditVersion} />
          <StockManagement
            key={stockProductId ?? "all"}
            selectedId={stockProductId}
            selectProduct={setStockProductId}
            refreshProducts={refreshProducts}
          />
        </div>

        <div className={wings.left}>
          <OnlinePanel />
        </div>
        <div className={wings.right} aria-hidden="true" />
      </div>

      {detailUser && (
        <CustomerDetails user={detailUser} close={() => setDetailUser(null)} />
      )}
      {showScanner && (
        <BarcodeScanner
          onScanSuccess={(scannedCode: string) => {
            setForm((prev) => ({ ...prev, cod_bara: scannedCode }));
            setShowScanner(false);
            alert(`Cod de bare citit: ${scannedCode}`);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

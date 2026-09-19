"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { signOutAccount } from '@/lib/account';
import { categorySlug } from "@/lib/category-path";
import BarcodeScanner from "../components/BarcodeScanner";
import FilterDrawer from "../components/FilterDrawer";
import CategoryDrawer from "../components/CategoryDrawer";
import s from "../customer.module.css";
import { useCatalogTheme } from "./useCatalogTheme";

interface Product {
  id: number;
  cod_bara: string;
  nume_produs: string;
  categorie: string;
  brand: string;
  varsta_recomandata: string;
  material: string;
  pret_retail: number;
  pret_engros: number;
  bucati_per_cutie: number;
  stoc_actual: number;
  imagini?: string[];
  descriere?: string;
}
interface Session {
  id?: number;
  nume_complet?: string;
  rol?: string;
}
function subscribeSession(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener("toylogix-session", update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener("toylogix-session", update);
  };
}
function sessionSnapshot() {
  try {
    return localStorage.getItem("user_session");
  } catch {
    return null;
  }
}
function parseSession(raw: string | null): Session | null {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
const money = (n: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(
    Number(n) || 0,
  );
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLocaleLowerCase("ro")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const images = (p: Product) => (p.imagini ?? []).filter(Boolean);

function Picture({
  src,
  name,
  eager = false,
}: {
  src?: string;
  name: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div className={s.noImage}>
        <span aria-hidden="true">◇</span>
        <small>Imagine indisponibilă</small>
      </div>
    );
  // Catalog images come from dynamic remote hosts and have a visible error fallback.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function Details({
  product: p,
  close,
  isFavorite,
  toggleFavorite,
  favoriteError,
}: {
  product: Product;
  close: () => void;
  isFavorite: boolean;
  toggleFavorite: () => void;
  favoriteError: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const gallery = images(p);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="product-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={s.dialogContent}>
        <div className={s.dialogTop}>
          <span className={s.eyebrow}>{p.categorie || "Catalog ToyLogix"}</span>
          <button
            className={s.iconButton}
            onClick={close}
            aria-label="Închide detaliile"
          >
            ✕
          </button>
        </div>
        <div className={s.detailGrid}>
          <div>
            <div className={s.detailImage}>
              <Picture
                key={gallery[index] ?? "empty"}
                src={gallery[index]}
                name={p.nume_produs}
                eager
              />
            </div>
            {gallery.length > 1 && (
              <div className={s.thumbnails} aria-label="Galerie produs">
                {gallery.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    aria-label={`Imaginea ${i + 1}`}
                    aria-pressed={i === index}
                    onClick={() => setIndex(i)}
                  >
                    <Picture
                      src={src}
                      name={`${p.nume_produs}, imaginea ${i + 1}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={s.detailInfo}>
            <p className={s.muted}>{p.brand || "ToyLogix · Catalog"}</p>
            <h2 id="product-title">{p.nume_produs}</h2>
            <button
              className={`${s.secondary} ${s.detailFavorite}`}
              aria-pressed={isFavorite}
              onClick={toggleFavorite}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
              {isFavorite ? "Elimină din favorite" : "Adaugă la favorite"}
            </button>
            {favoriteError && <p role="alert" className={s.priceWarning}>{favoriteError}</p>}
            <span
              className={Number(p.stoc_actual) > 0 ? s.inStock : s.outOfStock}
            >
              {Number(p.stoc_actual) > 0
                ? `În stoc · ${p.stoc_actual} buc.`
                : "Stoc epuizat"}
            </span>
            <div className={s.pricePanel}>
              <span className={s.eyebrow}>Preț en-gros / bucată</span>
              <strong>{money(p.pret_engros)}</strong>
              <p>Preț recomandat de vânzare: {money(p.pret_retail)}</p>
              <hr />
              <span>
                Ambalare: <b>{p.bucati_per_cutie || "—"} bucăți / cutie</b>
              </span>
            </div>
            <dl className={s.specifications}>
              {[
                ["Cod de bare", p.cod_bara],
                ["Vârstă recomandată", p.varsta_recomandata],
                ["Material", p.material],
                ["Categorie", p.categorie],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "Nespecificat"}</dd>
                </div>
              ))}
            </dl>
            <h3>Despre produs</h3>
            <p className={s.description}>
              {p.descriere ||
                "Descrierea acestui produs nu este încă disponibilă."}
            </p>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export default function Storefront({
  categoryName,
  requestedSlug,
  showPromotion = true,
}: {
  categoryName?: string;
  requestedSlug?: string;
  showPromotion?: boolean;
}) {
  const isCategoryPage = categoryName !== undefined || requestedSlug !== undefined;
  const category = categoryName ?? (requestedSlug ? requestedSlug.replace(/-/g, " ") : "");
  const router = useRouter();
  const { theme, toggleTheme } = useCatalogTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [pageSize, setPageSize] = useState(12);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const [brands, setBrands] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [age, setAge] = useState("");
  const [stockOnly, setStockOnly] = useState(false);
  const [sort, setSort] = useState("new");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const session = useSyncExternalStore(
    subscribeSession,
    sessionSnapshot,
    () => undefined,
  );
  const user = parseSession(session ?? null);
  const favoritesKey = user?.id ? `toylogix-favorites:${user.id}` : "toylogix-favorites";
  const savedFavorites = useSyncExternalStore(subscribeSession, () => {
    try { return localStorage.getItem(favoritesKey); } catch { return null; }
  }, () => null);
  const favorites: number[] = (() => {
    try {
      const saved: unknown = JSON.parse(savedFavorites || "[]");
      return Array.isArray(saved) ? saved.filter((id): id is number => typeof id === "number") : [];
    } catch { return []; }
  })();
  const [favoriteError, setFavoriteError] = useState("");
  const toggleFavorite = (id: number) => {
    try {
      const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
      localStorage.setItem(favoritesKey, JSON.stringify(next));
      window.dispatchEvent(new Event("toylogix-session"));
      setFavoriteError("");
    } catch { setFavoriteError("Favoritele nu pot fi salvate. Permite stocarea locală în browser."); }
  };
  useEffect(() => {
    if (session !== undefined && !parseSession(session))
      router.replace("/login");
  }, [router, session]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [scanner, setScanner] = useState(false);
  const load = useCallback(async (unmountSignal?: AbortSignal) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    unmountSignal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, 15000);
    try {
      const { data, error: failure } = await supabase
        .from("produse")
        .select("*")
        .order("id", { ascending: false })
        .abortSignal(controller.signal);
      if (unmountSignal?.aborted) return;
      if (failure) throw failure;
      setProducts(data ?? []);
    } catch {
      if (!unmountSignal?.aborted)
        setError(
          "Catalogul nu poate fi încărcat momentan. Verificați conexiunea și încercați din nou.",
        );
    } finally {
      clearTimeout(timeout);
      unmountSignal?.removeEventListener("abort", cancel);
      if (!unmountSignal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!session) return;
    // State updates inside load occur after the network request resolves (or fails).
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load, session]);
  const categoryProducts = products.filter((p) => !isCategoryPage || (requestedSlug
    ? categorySlug(p.categorie || "") === requestedSlug
    : norm(p.categorie) === norm(category)));
  const displayCategory = categoryProducts[0]?.categorie || category;
  const facetCount = (field: "brand" | "material", value: string) =>
    categoryProducts.filter((p) => norm(p[field]) === norm(value)).length;
  const values = (field: "categorie" | "brand" | "varsta_recomandata" | "material") =>
    Array.from(
      new Map(
        (field === "categorie" ? products : categoryProducts)
          .filter((p) => p[field]?.trim())
          .map((p) => [norm(p[field]), p[field].trim()]),
      ).values(),
    ).sort((a, b) => a.localeCompare(b, "ro"));
  const filtered = products
    .filter(
      (p) =>
        (!query ||
          [p.nume_produs, p.brand, p.cod_bara].some((v) =>
            norm(v).includes(norm(query)),
          )) &&
        (!isCategoryPage || (requestedSlug
          ? categorySlug(p.categorie || "") === requestedSlug
          : norm(p.categorie) === norm(category))) &&
        (!brands.length || brands.some((value) => norm(p.brand) === norm(value))) &&
        (!materials.length || materials.some((value) => norm(p.material) === norm(value))) &&
        (!favoritesOnly || favorites.includes(p.id)) &&
        (!age || norm(p.varsta_recomandata) === norm(age)) &&
        (!stockOnly || Number(p.stoc_actual) > 0) &&
        (minPrice === "" || Number(p.pret_engros) >= Number(minPrice)) &&
        (maxPrice === "" || Number(p.pret_engros) <= Number(maxPrice)),
    )
    .sort((a, b) =>
      sort === "price-up"
        ? Number(a.pret_engros) - Number(b.pret_engros)
        : sort === "price-down"
          ? Number(b.pret_engros) - Number(a.pret_engros)
          : sort === "name"
            ? String(a.nume_produs).localeCompare(String(b.nume_produs), "ro")
            : b.id - a.id,
    );
  const reset = () => {
    setQuery("");
    setMinPrice("");
    setMaxPrice("");
    setBrands([]);
    setMaterials([]);
    setFavoritesOnly(false);
    setAge("");
    setStockOnly(false);
  };
  const active = Boolean(
    query || brands.length || materials.length || favoritesOnly || age || stockOnly || minPrice || maxPrice,
  );
  const pageKey = JSON.stringify([
    query,
    category,
    brands,
    materials,
    favoritesOnly,
    favoritesOnly ? favorites : null,
    age,
    stockOnly,
    sort,
    minPrice,
    maxPrice,
    pageSize,
  ]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(
    pageCount,
    pagination.key === pageKey ? pagination.page : 1,
  );
  const pageProducts = isCategoryPage
    ? filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : filtered;
  const changePage = (page: number) => {
    setPagination({ key: pageKey, page });
    document
      .getElementById("catalog")
      ?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  const scanSuccess = useCallback((code: string) => {
    setQuery(code);
    setScanner(false);
  }, [setScanner]);
  const featured = products.find((p) => images(p).length > 0);
  const filterControls = (
    <>
      {(["brand", "material"] as const).map((field) => {
        const selectedValues = field === "brand" ? brands : materials;
        const update = field === "brand" ? setBrands : setMaterials;
        return <details className={s.filterSection} open key={field}>
          <summary>{field === "brand" ? "Brand" : "Material"}</summary>
          <div className={s.facetOptions}>
            {values(field).map((v) => <label className={s.checkbox} key={v}>
              <input type="checkbox" checked={selectedValues.includes(v)} onChange={() =>
                update((current) => current.includes(v) ? current.filter((item) => item !== v) : [...current, v])
              } />
              <span>{v} <span className={s.muted}>({facetCount(field, v)})</span></span>
            </label>)}
            {!values(field).length && <small className={s.muted}>Nicio opțiune disponibilă</small>}
          </div>
        </details>;
      })}
      <details className={s.filterSection} open>
        <summary>Vârstă</summary>
        <label className={s.facetOptions}>
          <span className={s.screenReader}>Vârstă recomandată</span>
          <select value={age} onChange={(e) => setAge(e.target.value)}>
            <option value="">Toate vârstele</option>
            {values("varsta_recomandata").map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
      </details>
      <details className={s.filterSection} open>
        <summary>Preț en-gros (RON)</summary>
        <div className={s.facetOptions}>
          <div className={s.priceRange}>
            <input aria-label="Preț minim" type="number" min="0" step="0.01" placeholder="De la" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
            <span>–</span>
            <input aria-label="Preț maxim" type="number" min="0" step="0.01" placeholder="Până la" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </div>
          {minPrice !== "" && maxPrice !== "" && Number(minPrice) > Number(maxPrice) &&
            <p role="alert" className={s.priceWarning}>Prețul minim trebuie să fie mai mic decât prețul maxim.</p>}
        </div>
      </details>
      <label className={s.checkbox}>
        <input
          type="checkbox"
          checked={stockOnly}
          onChange={(e) => setStockOnly(e.target.checked)}
        />
        Doar produse în stoc
      </label>
      <button className={s.textButton} onClick={reset}>
        Resetează filtrele
      </button>
    </>
  );
  if (!user) return null;
  return (
    <div className={`${s.page} ${isCategoryPage ? s.categoryPage : ""} ${theme === "dark" ? s.dark : ""}`} data-theme={theme}>
      <a className={s.skipLink} href="#catalog">
        Mergi la catalog
      </a>
      <div className={s.topbar}>
        UN UNIVERS DE JOACĂ. UN PARTENER PENTRU AFACEREA TA.
      </div>
      <header className={s.header}>
        <div className={s.headerInner}>
          <div className={s.brandNavigation}>
            <Link href="/store" className={s.logo}>
              <span className={s.logoMark}>
                T<span>·</span>
              </span>
              <span>
                ToyLogix<small>JUCĂRII & DISTRIBUȚIE B2B</small>
              </span>
            </Link>
            <button
              className={s.hamburger}
              aria-label="Deschide categoriile"
              aria-expanded={categoryOpen}
              aria-controls="category-menu"
              onClick={() => setCategoryOpen((open) => !open)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className={`${s.search} ${s.headerSearch}`}>
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Caută produse"
              placeholder="Caută un produs, brand sau cod de bare…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button title="Scanează codul de bare" aria-label="Scanează codul de bare" onClick={() => setScanner(true)}>▥</button>
            {query && (
              <button
                aria-label="Șterge căutarea"
                onClick={() => setQuery("")}
              >
                ✕
              </button>
            )}
          </div>
          <nav className={s.navigation} aria-label="Navigare principală">
            {user ? (
              <div className={s.accountControls}>
                <button className={s.themeToggle} onClick={toggleTheme}
                  aria-label={theme === "dark" ? "Activează tema luminoasă" : "Activează tema întunecată"}
                  title={theme === "dark" ? "Tema luminoasă" : "Tema întunecată"} aria-pressed={theme === "dark"}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                    {theme === "dark" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />}
                  </svg>
                </button>
                <button className={s.wishlistLink} aria-pressed={favoritesOnly} onClick={() => {
                  setFavoritesOnly((value) => !value);
                  document.getElementById("catalog")?.scrollIntoView({ block: "start" });
                }}><span aria-hidden="true">♡</span> Favorite <b>{favorites.length}</b></button>
                <Link href="/account" className={s.accountBadge} aria-label="Contul meu">
                  <span className={s.accountAvatar} aria-hidden="true">{(user.nume_complet || "Partener").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ro")}</span>
                  <div className={s.accountIdentity}>
                    <span className={s.userName} title={user.nume_complet}>{user.nume_complet || "Partener"}</span>
                    <small>{user.rol === "admin" ? "Administrator" : "Partener ToyLogix"}</small>
                  </div>
                </Link>
                {user.rol === "admin" && <Link className={`${s.headerAction} ${s.adminAction}`} href="/admin">Admin Panel <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg></Link>}
                <button
                  className={`${s.headerAction} ${s.logoutAction}`}
                  aria-label="Ieșire din cont"
                  title="Ieșire din cont"
                  onClick={async () => {
                    await signOutAccount();
                    router.replace('/login');
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H5v16h4M10 12h11m-4-4 4 4-4 4" /></svg>
                  <span>Ieșire</span>
                </button>
              </div>
            ) : (
              <>
                <Link href="/login">Autentificare</Link>
                <Link className={s.primary} href="/register">
                  Devino partener <span aria-hidden="true">↗</span>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className={s.container}>
        {!isCategoryPage && (
          <section className={s.hero} aria-labelledby="hero-title">
            <div className={s.heroCopy}>
              <span className={s.eyebrow}>
                PENTRU MICILE MARILE DESCOPERIRI
              </span>
              <h1 id="hero-title">
                Joaca începe aici.
                <br />
                <em>La fel și oportunitățile.</em>
              </h1>
              <p>
                Descoperă jucării pentru magazinul tău. Explorează colecțiile,
                compară produsele și găsește următorul favorit.
              </p>
              <a className={s.primary} href="#catalog">
                Explorează catalogul <span aria-hidden="true">↓</span>
              </a>
              <div className={s.heroMeta}>
                <span>01 / Descoperă</span>
                <span>02 / Compară</span>
                <span>03 / Alege</span>
              </div>
            </div>
            <div className={s.heroArt}>
              <span className={s.orbit} aria-hidden="true" />
              <span className={s.artLabel}>THE PLAY EDIT</span>
              {featured ? (
                <button
                  className={s.featuredProduct}
                  onClick={() => setSelected(featured)}
                  aria-label={`Vezi ${featured.nume_produs}`}
                >
                  <Picture
                    src={images(featured)[0]}
                    name={featured.nume_produs}
                    eager
                  />
                  <span>
                    {featured.nume_produs} <b aria-hidden="true">↗</b>
                  </span>
                </button>
              ) : (
                <div className={s.abstractToy} aria-hidden="true">
                  <span>T</span>
                  <span>O</span>
                  <span>Y</span>
                </div>
              )}
              <span className={s.artNote}>
                Curiozitate. Creativitate. Joacă.
              </span>
            </div>
          </section>
        )}
        {isCategoryPage && (
          <div className={s.categoryHeading}>
            <nav className={s.breadcrumb} aria-label="Breadcrumb">
              <Link href="/store">Acasă</Link>
              <span aria-hidden="true">›</span>
              <span aria-current="page">{displayCategory}</span>
            </nav>
            <div className={s.categoryTitle}><h1>{displayCategory}</h1>
              {!loading && !error && <span className={s.countBadge}>({categoryProducts.length} {categoryProducts.length === 1 ? "produs" : "produse"})</span>}
            </div>
          </div>
        )}
        <section
          id="catalog"
          className={s.catalog}
          aria-labelledby="catalog-title"
        >
          {!isCategoryPage && (
            <div className={s.sectionHeading}>
              <div>
                <span className={s.eyebrow}>CATALOGUL TOYLOGIX</span>
                <h2 id="catalog-title">
                  O lume de posibilități<span>.</span>
                </h2>
              </div>
              <p>Jucării pentru fiecare etapă a copilăriei.</p>
            </div>
          )}
          {isCategoryPage && (
            <h2 id="catalog-title" className={s.screenReader}>
              Produse din categoria {category}
            </h2>
          )}
          <div className={isCategoryPage ? s.categoryLayout : undefined}>
            {isCategoryPage && (
              <aside className={s.filterSidebar} aria-label="Filtre produse">
                <h2>Filtrează produsele</h2>
                {filterControls}
              </aside>
            )}
            <div className={s.catalogResults}>
              {isCategoryPage && showPromotion && <aside className={s.promoStrip} aria-label="Descoperă catalogul ToyLogix">
                <span className={s.promoIcon} aria-hidden="true">✦</span>
                <div><strong>Idei mici. Oportunități mari.</strong><p>Descoperă următoarele favorite ale magazinului tău.</p></div>
                <span className={s.promoLabel}>COLECȚIA TOYLOGIX</span>
              </aside>}
              <div className={s.toolbar}>
                {!isCategoryPage && (
                  <button
                    className={s.secondary}
                    aria-expanded={filtersOpen}
                    aria-controls="catalog-filters"
                    onClick={() => setFiltersOpen(!filtersOpen)}
                  >
                    Filtre {filtersOpen ? "−" : "+"}
                  </button>
                )}
                {isCategoryPage && <button className={`${s.secondary} ${s.mobileFilterButton}`} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="mobile-filters">Filtrează</button>}
              </div>
              {!isCategoryPage && filtersOpen && (
                <div id="catalog-filters" className={s.filters}>
                  {filterControls}
                </div>
              )}
              {favoriteError && <p role="alert" className={s.priceWarning}>{favoriteError}</p>}
              <div className={s.resultRow}>
                <span role="status">
                  {loading
                    ? "Se încarcă produsele…"
                    : error
                      ? "Catalog indisponibil"
                      : `${filtered.length} ${filtered.length === 1 ? "produs" : "produse"}`}
                  {active && !loading && (
                    <button className={s.textButton} onClick={reset}>
                      Șterge filtrele
                    </button>
                  )}
                </span>
                <label>
                  Sortează după
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="new">Cele mai noi</option>
                    <option value="price-up">Preț crescător</option>
                    <option value="price-down">Preț descrescător</option>
                    <option value="name">Nume A–Z</option>
                  </select>
                </label>
                {isCategoryPage && (
                  <label>
                    Produse pe pagină
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                      {[12, 24, 48].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {loading ? (
                <div className={s.grid} aria-busy="true">
                  {[1, 2, 3, 4].map((i) => (
                    <div className={s.skeleton} key={i} />
                  ))}
                </div>
              ) : error ? (
                <div className={s.empty} role="alert">
                  <span aria-hidden="true">↻</span>
                  <h3>Încercăm din nou?</h3>
                  <p>{error}</p>
                  <button
                    className={s.primary}
                    onClick={() => {
                      setLoading(true);
                      setError("");
                      void load();
                    }}
                  >
                    Reîncearcă
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className={s.empty}>
                  <span aria-hidden="true">⌕</span>
                  <h3>
                    {active ? "Niciun produs găsit" : "Catalogul se pregătește"}
                  </h3>
                  <p>
                    {active
                      ? "Încearcă alt termen sau elimină câteva filtre."
                      : "Revino în curând pentru a descoperi produsele disponibile."}
                  </p>
                  {active && (
                    <button className={s.primary} onClick={reset}>
                      Vezi toate produsele
                    </button>
                  )}
                </div>
              ) : (
                <div className={s.grid}>
                  {pageProducts.map((p) => (
                    <article key={p.id} className={s.card}>
                      <button className={s.favoriteButton} aria-label={`${favorites.includes(p.id) ? "Elimină din" : "Adaugă la"} favorite: ${p.nume_produs}`} aria-pressed={favorites.includes(p.id)} onClick={() => toggleFavorite(p.id)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={favorites.includes(p.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
                      </button>
                      <button className={s.productOpen} onClick={() => setSelected(p)} aria-label={`Vezi detalii: ${p.nume_produs}`}>

                      <div
                        className={s.cardImage}
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const x = ((event.clientX - bounds.left) / bounds.width) * 100;
                          const y = ((event.clientY - bounds.top) / bounds.height) * 100;
                          event.currentTarget.style.setProperty("--zoom-x", `${x}%`);
                          event.currentTarget.style.setProperty("--zoom-y", `${y}%`);
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.setProperty("--zoom-x", "center");
                          event.currentTarget.style.setProperty("--zoom-y", "center");
                        }}
                      >
                        <Picture src={images(p)[0]} name={p.nume_produs} />
                        <span className={s.categoryTag}>
                          EN-GROS
                        </span>
                        <span className={s.cardArrow} aria-hidden="true">
                          ↗
                        </span>
                      </div>
                      <div className={s.cardBody}>
                        <div className={s.cardMeta}>
                          <span>{p.brand || "ToyLogix"}</span>
                          <span
                            className={
                              Number(p.stoc_actual) > 0
                                ? s.inStock
                                : s.outOfStock
                            }
                          >
                            {Number(p.stoc_actual) > 0
                              ? "În stoc"
                              : "Stoc epuizat"}
                          </span>
                        </div>
                        <h3>{p.nume_produs}</h3>
                        <p className={s.pack}>
                          {p.bucati_per_cutie
                            ? `${p.bucati_per_cutie} buc. / cutie`
                            : "Ambalare nespecificată"}
                          {p.varsta_recomandata && ` · ${p.varsta_recomandata}`}
                        </p>
                        <div className={s.cardPrice}>
                          <div>
                            <small>PREȚ EN-GROS</small>
                            <strong>{money(p.pret_engros)}</strong>
                          </div>
                          <span>
                            RRP <br />
                            {money(p.pret_retail)}
                          </span>
                        </div>
                      </div>
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {isCategoryPage && !loading && !error && filtered.length > 0 && (
                <nav className={s.pagination} aria-label="Paginare produse">
                  <div>
                    <button
                      disabled={currentPage === 1}
                      onClick={() => changePage(currentPage - 1)}
                      aria-label="Pagina precedentă"
                    >
                      ←
                    </button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1)
                      .filter(
                        (n) =>
                          n === 1 ||
                          n === pageCount ||
                          Math.abs(n - currentPage) <= 1,
                      )
                      .map((n, i, a) => (
                        <span key={n}>
                          {i > 0 && n - a[i - 1] > 1 && <span>…</span>}
                          <button
                            aria-label={`Pagina ${n}`}
                            aria-current={
                              currentPage === n ? "page" : undefined
                            }
                            onClick={() => changePage(n)}
                          >
                            {n}
                          </button>
                        </span>
                      ))}
                    <button
                      disabled={currentPage === pageCount}
                      onClick={() => changePage(currentPage + 1)}
                      aria-label="Pagina următoare"
                    >
                      →
                    </button>
                  </div>
                  <span>
                    {(currentPage - 1) * pageSize + 1}–
                    {Math.min(currentPage * pageSize, filtered.length)} din{" "}
                    {filtered.length}
                  </span>
                </nav>
              )}
            </div>
          </div>
        </section>
        {!isCategoryPage && !user && (
          <section className={s.partner}>
            <div>
              <span className={s.eyebrow}>CREȘTEM PRIN JOACĂ</span>
              <h2>Următorul capitol al magazinului tău.</h2>
              <p>
                Solicită un cont de partener ToyLogix. Echipa noastră va
                verifica cererea ta.
              </p>
            </div>
            <Link href="/register" className={s.primary}>
              Devino partener <span aria-hidden="true">↗</span>
            </Link>
          </section>
        )}
      </main>
      <footer className={s.footer}>
        <Link href="/store" className={s.footerLogo}>
          ToyLogix<span>·</span>
        </Link>
        <p>Jucării. Idei. Noi posibilități.</p>
        <nav aria-label="Navigare subsol">
          <a href="#catalog">Catalog</a>
          <Link href="/login">Contul meu</Link>
          <Link href="/register">Parteneriat B2B</Link>
        </nav>
        <small>© {new Date().getFullYear()} ToyLogix</small>
      </footer>
      {isCategoryPage && filtersOpen && <FilterDrawer close={() => setFiltersOpen(false)} count={filtered.length}>{filterControls}</FilterDrawer>}
      {categoryOpen && (
        <CategoryDrawer
          categories={values("categorie")}
          current={isCategoryPage ? displayCategory : ""}
          close={() => setCategoryOpen(false)}
        />
      )}
      {selected && (
        <Details
          key={selected.id}
          product={selected}
          close={() => setSelected(null)}
          isFavorite={favorites.includes(selected.id)}
          toggleFavorite={() => toggleFavorite(selected.id)}
          favoriteError={favoriteError}
        />
      )}{" "}
      {scanner && (
        <BarcodeScanner
          onScanSuccess={scanSuccess}
          onClose={() => setScanner(false)}
        />
      )}
    </div>
  );
}

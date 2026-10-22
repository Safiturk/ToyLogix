"use client";
import NumericInput from "@/app/components/NumericInput";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { signOutAccount } from "@/lib/account";
import { categorySlug } from "@/lib/category-path";
import FilterDrawer from "../components/FilterDrawer";
import CategoryDrawer from "../components/CategoryDrawer";
import BrandLogo from "../components/BrandLogo";
import s from "../customer.module.css";
import { useCatalogTheme } from "./useCatalogTheme";
import { useWishlistMotion } from "./useWishlistMotion";
import {
  type ProductCard,
  type CatalogField,
  productImages,
  formatPrice,
} from "@/lib/catalog";
import {
  hasArchiveColumn,
  productPageQuery,
  loadFacet,
  loadFavoriteProducts,
} from "@/lib/catalog-query";
import ProductPicture from "./ProductPicture";
import FavoritesDialog from "./FavoritesDialog";
import MobileAccountMenu from "./MobileAccountMenu";
import ProductDetails from "./ProductDetails";
import { AddToCart, CartLink } from "./CartControls";
import { useStoreSession, parseStoreSession } from "./useStoreSession";
import { useFavorites } from "./useFavorites";

const ThemePicker = dynamic(() => import("./ThemePicker"));

export default function Storefront({
  categoryName,
  requestedSlug,
  showPromotion = true,
}: {
  categoryName?: string;
  requestedSlug?: string;
  showPromotion?: boolean;
}) {
  const isCategoryPage =
    categoryName !== undefined || requestedSlug !== undefined;
  const category =
    categoryName ?? (requestedSlug ? requestedSlug.replace(/-/g, " ") : "");
  const router = useRouter();
  const logout = async () => {
    await signOutAccount();
    router.replace("/login");
  };
  const { theme } = useCatalogTheme();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [fetching, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState("");
  const [catalogError, setError] = useState("");
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [pageSize, setPageSize] = useState(12);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const [brands, setBrands] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [age, setAge] = useState("");
  const [stockOnly, setStockOnly] = useState(false);
  const [sort, setSort] = useState("new");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const { session, user } = useStoreSession();
  const { favorites, favoriteError, toggleFavorite } = useFavorites(user?.id);
  const wishlistIcon = useRef<HTMLSpanElement>(null);
  const wishlistBadge = useRef<HTMLElement>(null);
  const mobileWishlistTarget = useRef<HTMLSpanElement>(null);
  const { fly, cancel: cancelWishlistMotion } = useWishlistMotion();
  useEffect(() => {
    if (session !== undefined && !parseStoreSession(session))
      router.replace("/login");
  }, [router, session]);
  const [selected, setSelected] = useState<ProductCard | null>(null);
  useEffect(() => {
    if (selected || favoritesOpen) cancelWishlistMotion();
  }, [selected, favoritesOpen, cancelWishlistMotion]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Record<CatalogField, string[]>>({
    categorie: [],
    brand: [],
    material: [],
    varsta_recomandata: [],
  });
  const [facetsReady, setFacetsReady] = useState(false);
  const [facetError, setFacetError] = useState("");
  const [retry, setRetry] = useState(0);
  const [favoriteProducts, setFavoriteProducts] = useState<ProductCard[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesLoadError, setFavoritesLoadError] = useState("");
  const resolvedCategory = requestedSlug
    ? facets.categorie.find((value) => categorySlug(value) === requestedSlug)
    : categoryName;
  const displayCategory = resolvedCategory ?? category;
  const error = catalogError || (requestedSlug ? facetError : "");
  const facetOptions = (field: CatalogField) => facets[field];
  const pageKey = JSON.stringify([
    query,
    resolvedCategory,
    requestedSlug,
    brands,
    materials,
    age,
    stockOnly,
    sort,
    minPrice,
    maxPrice,
    pageSize,
  ]);
  const currentPage = pagination.key === pageKey ? pagination.page : 1;
  const loading = !error && (fetching || loadedKey !== `${pageKey}:${currentPage}`);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    async function load() {
      setFacetsReady(false);
      setFacetError("");
      try {
        const categories = await loadFacet(supabase, "categorie", signal);
        const selectedCategory = requestedSlug
          ? categories.find((value) => categorySlug(value) === requestedSlug)
          : categoryName;
        const [brand, material, varsta_recomandata] = await Promise.all(
          (["brand", "material", "varsta_recomandata"] as const).map((field) =>
            loadFacet(supabase, field, signal, selectedCategory),
          ),
        );
        if (!controller.signal.aborted) {
          setFacets({
            categorie: categories,
            brand,
            material,
            varsta_recomandata,
          });
          setFacetsReady(true);
        }
      } catch {
        if (!controller.signal.aborted)
          setFacetError("Filtrele nu pot fi incarcate. Incercati din nou.");
      }
    }
    void load();
    return () => controller.abort();
  }, [session, categoryName, requestedSlug, retry]);

  useEffect(() => {
    if (!session || (requestedSlug && !facetsReady)) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (requestedSlug && resolvedCategory === undefined) {
          setProducts([]);
          setTotal(0);
          return;
        }
        const archiveAvailable = await hasArchiveColumn(
          supabase,
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        const {
          data,
          count,
          error: failure,
        } = await productPageQuery(
          supabase,
          {
            query,
            category: resolvedCategory,
            brands,
            materials,
            age,
            stockOnly,
            minPrice,
            maxPrice,
            sort,
            page: currentPage,
            pageSize,
          },
          false,
          archiveAvailable,
        )
          .abortSignal(
            AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          )
          .overrideTypes<ProductCard[], { merge: false }>();
        if (controller.signal.aborted) return;
        if (failure) throw failure;
        const lastPage = Math.max(1, Math.ceil((count ?? 0) / pageSize));
        if (currentPage > lastPage) {
          setPagination({ key: pageKey, page: lastPage });
          return;
        }
        setProducts(data ?? []);
        setTotal(count ?? 0);
      } catch {
        if (!controller.signal.aborted)
          setError(
            "Catalogul nu poate fi incarcat momentan. Verificati conexiunea si incercati din nou.",
          );
      } finally {
        if (!controller.signal.aborted) {
          setLoadedKey(`${pageKey}:${currentPage}`);
          setLoading(false);
        }
      }
    }
    // Debounce typing and cancel obsolete responses on every filter/page change.
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    session,
    facetsReady,
    query,
    resolvedCategory,
    requestedSlug,
    brands,
    materials,
    age,
    stockOnly,
    minPrice,
    maxPrice,
    sort,
    currentPage,
    pageSize,
    pageKey,
    retry,
  ]);

  useEffect(() => {
    if (!favoritesOpen || !session) return;
    const controller = new AbortController();
    async function load() {
      setFavoritesLoading(true);
      setFavoritesLoadError("");
      try {
        const data = await loadFavoriteProducts(
          supabase,
          favorites,
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        if (!controller.signal.aborted) setFavoriteProducts(data);
      } catch {
        if (!controller.signal.aborted)
          setFavoritesLoadError("Favoritele nu pot fi incarcate.");
      } finally {
        if (!controller.signal.aborted) setFavoritesLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [favoritesOpen, favorites, session]);
  const resetFilters = () => {
    setQuery("");
    setMinPrice("");
    setMaxPrice("");
    setBrands([]);
    setMaterials([]);
    setAge("");
    setStockOnly(false);
  };
  const hasActiveFilters = Boolean(
    query ||
    brands.length ||
    materials.length ||
    age ||
    stockOnly ||
    minPrice ||
    maxPrice,
  );
  const changePage = (page: number) => {
    setPagination({ key: pageKey, page });
    document.getElementById("catalog")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const featured = products.find(
    (product) => productImages(product).length > 0,
  );
  const filterControls = (
    <>
      {(["brand", "material"] as const).map((field) => {
        const selectedValues = field === "brand" ? brands : materials;
        const update = field === "brand" ? setBrands : setMaterials;
        return (
          <details className={s.filterSection} open key={field}>
            <summary>{field === "brand" ? "Brand" : "Material"}</summary>
            <div className={s.facetOptions}>
              {facetOptions(field).map((v) => (
                <label className={s.checkbox} key={v}>
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(v)}
                    onChange={() =>
                      update((current) =>
                        current.includes(v)
                          ? current.filter((item) => item !== v)
                          : [...current, v],
                      )
                    }
                  />
                  <span>{v} </span>
                </label>
              ))}
              {!facetOptions(field).length && (
                <small className={s.muted}>Nicio optiune disponibila</small>
              )}
            </div>
          </details>
        );
      })}
      <details className={s.filterSection} open>
        <summary>Varsta</summary>
        <label className={s.facetOptions}>
          <span className={s.screenReader}>Varsta recomandata</span>
          <select value={age} onChange={(e) => setAge(e.target.value)}>
            <option value="">Toate varstele</option>
            {facetOptions("varsta_recomandata").map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </details>
      <details className={s.filterSection} open>
        <summary>Pret en-gros (RON)</summary>
        <div className={s.facetOptions}>
          <div className={s.priceRange}>
            <NumericInput
              aria-label="Pret minim"
              type="number"
              min="0"
              step="0.01"
              placeholder="De la"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
            <span>–</span>
            <NumericInput
              aria-label="Pret maxim"
              type="number"
              min="0"
              step="0.01"
              placeholder="Pana la"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>
          {minPrice !== "" &&
            maxPrice !== "" &&
            Number(minPrice) > Number(maxPrice) && (
              <p role="alert" className={s.priceWarning}>
                Pretul minim trebuie sa fie mai mic decat pretul maxim.
              </p>
            )}
        </div>
      </details>
      <label className={s.checkbox}>
        <input
          type="checkbox"
          checked={stockOnly}
          onChange={(e) => setStockOnly(e.target.checked)}
        />
        Doar produse in stoc
      </label>
      <button className={s.textButton} onClick={resetFilters}>
        Reseteaza filtrele
      </button>
    </>
  );
  if (!user) return null;
  return (
    <div
      className={`${s.page} ${isCategoryPage ? s.categoryPage : ""} ${theme !== "light" ? s.dark : ""} ${theme === "petrol" ? s.petrol : ""}`}
      data-theme={theme}
    >
      <a className={s.skipLink} href="#catalog">
        Mergi la catalog
      </a>
      <div className={s.topbar}>
        UN UNIVERS DE JOACA. UN PARTENER PENTRU AFACEREA TA.
      </div>
      <header className={s.header}>
        <div className={s.headerInner}>
          <div className={s.brandNavigation}>
            <BrandLogo className={s.logo} />
            <MobileAccountMenu
              name={user.nume_complet}
              isAdmin={user.rol === "admin"}
              favoriteCount={favorites.length}
              favoritesOpen={favoritesOpen}
              onOpenFavorites={() => setFavoritesOpen(true)}
              onOpenAppearance={() => setAppearanceOpen(true)}
              onLogout={logout}
              wishlistTargetRef={mobileWishlistTarget}
            />
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
              aria-label="Cauta produse"
              placeholder="Cauta un produs, brand sau cod de bare…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
{query && (
              <button aria-label="Sterge cautarea" onClick={() => setQuery("")}>
                ✕
              </button>
            )}
          </div>
          <nav className={s.navigation} aria-label="Navigare principala">
            {user ? (
              <div className={s.accountControls}>
<button
                  className={s.wishlistLink}
                  aria-haspopup="dialog"
                  aria-expanded={favoritesOpen}
                  aria-controls="favorites-dialog"
                  onClick={() => setFavoritesOpen(true)}
                >
                  <span ref={wishlistIcon} aria-hidden="true">
                    ♡
                  </span>{" "}
                  Favorite <b ref={wishlistBadge}>{favorites.length}</b>
                </button>
                <MobileAccountMenu
                  desktop
                  name={user.nume_complet}
                  isAdmin={user.rol === "admin"}
                  favoriteCount={favorites.length}
                  favoritesOpen={favoritesOpen}
                  onOpenFavorites={() => setFavoritesOpen(true)}
                  onOpenAppearance={() => setAppearanceOpen(true)}
                  onLogout={logout}
                />
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
        <CartLink />
      </header>
      <main className={s.container}>
        {!isCategoryPage && (
          <section className={s.hero} aria-labelledby="hero-title">
            <div className={s.heroCopy}>
              <span className={s.eyebrow}>
                PENTRU MICILE MARILE DESCOPERIRI
              </span>
              <h1 id="hero-title">
                Joaca incepe aici.
                <br />
                <em>La fel si oportunitatile.</em>
              </h1>
              <p>
                Descopera jucarii pentru magazinul tau. Exploreaza colectiile,
                compara produsele si gaseste urmatorul favorit.
              </p>
              <a className={s.primary} href="#catalog">
                Exploreaza catalogul <span aria-hidden="true">↓</span>
              </a>
              <div className={s.heroMeta}>
                <span>01 / Descopera</span>
                <span>02 / Compara</span>
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
                  <ProductPicture
                    src={productImages(featured)[0]}
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
                Curiozitate. Creativitate. Joaca.
              </span>
            </div>
          </section>
        )}
        {isCategoryPage && (
          <div className={s.categoryHeading}>
            <nav className={s.breadcrumb} aria-label="Breadcrumb">
              <Link href="/store">Acasa</Link>
              <span aria-hidden="true">›</span>
              <span aria-current="page">{displayCategory}</span>
            </nav>
            <div className={s.categoryTitle}>
              <h1>{displayCategory}</h1>
              {!loading && !error && (
                <span className={s.countBadge}>
                  ({total} {total === 1 ? "produs" : "produse"})
                </span>
              )}
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
                  O lume de posibilitati<span>.</span>
                </h2>
              </div>
              <p>Jucarii pentru fiecare etapa a copilariei.</p>
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
                <h2>Filtreaza produsele</h2>
                {filterControls}
              </aside>
            )}
            <div className={s.catalogResults}>
              {isCategoryPage && showPromotion && (
                <aside
                  className={s.promoStrip}
                  aria-label="Descopera catalogul ToyLogix"
                >
                  <span className={s.promoIcon} aria-hidden="true">
                    ✦
                  </span>
                  <div>
                    <strong>Idei mici. Oportunitati mari.</strong>
                    <p>Descopera urmatoarele favorite ale magazinului tau.</p>
                  </div>
                  <span className={s.promoLabel}>COLECTIA TOYLOGIX</span>
                </aside>
              )}
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
                {isCategoryPage && (
                  <button
                    className={`${s.secondary} ${s.mobileFilterButton}`}
                    onClick={() => setFiltersOpen((open) => !open)}
                    aria-expanded={filtersOpen}
                    aria-controls="mobile-filters"
                  >
                    Filtreaza
                  </button>
                )}
              </div>
              {!isCategoryPage && filtersOpen && (
                <div id="catalog-filters" className={s.filters}>
                  {filterControls}
                </div>
              )}
              {favoriteError && (
                <p role="alert" className={s.priceWarning}>
                  {favoriteError}
                </p>
              )}
              {facetError && !requestedSlug && (
                <p role="alert" className={s.priceWarning}>
                  {facetError}{" "}
                  <button className={s.textButton} onClick={() => setRetry((value) => value + 1)}>
                    Reincearca
                  </button>
                </p>
              )}
              <div className={s.resultRow}>
                <span role="status">
                  {loading
                    ? "Se incarca produsele…"
                    : error
                      ? "Catalog indisponibil"
                      : `${total} ${total === 1 ? "produs" : "produse"}`}
                  {hasActiveFilters && !loading && (
                    <button className={s.textButton} onClick={resetFilters}>
                      Sterge filtrele
                    </button>
                  )}
                </span>
                <label>
                  Sorteaza dupa
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="new">Cele mai noi</option>
                    <option value="price-up">Pret crescator</option>
                    <option value="price-down">Pret descrescator</option>
                    <option value="name">Nume A–Z</option>
                  </select>
                </label>
                {isCategoryPage && (
                  <label>
                    Produse pe pagina
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
              {loading && !error ? (
                <div className={s.grid} aria-busy="true">
                  {[1, 2, 3, 4].map((i) => (
                    <div className={s.skeleton} key={i} />
                  ))}
                </div>
              ) : error ? (
                <div className={s.empty} role="alert">
                  <span aria-hidden="true">↻</span>
                  <h3>Incercam din nou?</h3>
                  <p>{error}</p>
                  <button
                    className={s.primary}
                    onClick={() => {
                      setLoading(true);
                      setError("");
                      setRetry((value) => value + 1);
                    }}
                  >
                    Reincearca
                  </button>
                </div>
              ) : total === 0 ? (
                <div className={s.empty}>
                  <span aria-hidden="true">⌕</span>
                  <h3>
                    {hasActiveFilters
                      ? "Niciun produs gasit"
                      : "Catalogul se pregateste"}
                  </h3>
                  <p>
                    {hasActiveFilters
                      ? "Incearca alt termen sau elimina cateva filtre."
                      : "Revino in curand pentru a descoperi produsele disponibile."}
                  </p>
                  {hasActiveFilters && (
                    <button className={s.primary} onClick={resetFilters}>
                      Vezi toate produsele
                    </button>
                  )}
                </div>
              ) : (
                <div className={s.grid}>
                  {products.map((product) => (
                    <article key={product.id} className={s.card}>
                      <button
                        className={s.favoriteButton}
                        aria-label={`${favorites.includes(product.id) ? "Elimina din" : "Adauga la"} favorite: ${product.nume_produs}`}
                        aria-pressed={favorites.includes(product.id)}
                        onClick={(event) => {
                          const added = toggleFavorite(product.id);
                          if (!added) {
                            cancelWishlistMotion();
                            return;
                          }
                          const source = event.currentTarget
                            .closest("article")
                            ?.querySelector<HTMLElement>(`.${s.cardImage}`);
                          if (source) {
                            const isMobile =
                              window.matchMedia("(max-width: 767px)").matches;
                            fly(
                              source,
                              isMobile
                                ? mobileWishlistTarget.current
                                : wishlistIcon.current,
                              isMobile
                                ? mobileWishlistTarget.current
                                : wishlistBadge.current,
                            );
                          }
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill={
                            favorites.includes(product.id)
                              ? "currentColor"
                              : "none"
                          }
                          stroke="currentColor"
                          strokeWidth="1.6"
                          aria-hidden="true"
                        >
                          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
                        </svg>
                      </button>
                      <button
                        className={s.productOpen}
                        onClick={() => setSelected(product)}
                        aria-label={`Vezi detalii: ${product.nume_produs}`}
                      >
                        <div
                          className={s.cardImage}
                          onMouseMove={(event) => {
                            const bounds =
                              event.currentTarget.getBoundingClientRect();
                            const x =
                              ((event.clientX - bounds.left) / bounds.width) *
                              100;
                            const y =
                              ((event.clientY - bounds.top) / bounds.height) *
                              100;
                            event.currentTarget.style.setProperty(
                              "--zoom-x",
                              `${x}%`,
                            );
                            event.currentTarget.style.setProperty(
                              "--zoom-y",
                              `${y}%`,
                            );
                          }}
                          onMouseLeave={(event) => {
                            event.currentTarget.style.setProperty(
                              "--zoom-x",
                              "center",
                            );
                            event.currentTarget.style.setProperty(
                              "--zoom-y",
                              "center",
                            );
                          }}
                        >
                          <ProductPicture
                            src={productImages(product)[0]}
                            name={product.nume_produs}
                          />
                          <span className={s.categoryTag}>EN-GROS</span>
                          <span className={s.cardArrow} aria-hidden="true">
                            ↗
                          </span>
                        </div>
                        <div className={s.cardBody}>
                          <div className={s.cardMeta}>
                            <span>{product.brand || "ToyLogix"}</span>
                            <span
                              className={
                                Number(product.stoc_actual) > 0
                                  ? s.inStock
                                  : s.outOfStock
                              }
                            >
                              {Number(product.stoc_actual) > 0
                                ? "In stoc"
                                : "Stoc epuizat"}
                            </span>
                          </div>
                          <h3>{product.nume_produs}</h3>
                          <p className={s.pack}>
                            {product.bucati_per_cutie
                              ? `${product.bucati_per_cutie} buc. / cutie`
                              : "Ambalare nespecificata"}
                            {product.varsta_recomandata &&
                              ` · ${product.varsta_recomandata}`}
                          </p>
                          <div className={s.cardPrice}>
                            <div>
                              <small>PRET EN-GROS</small>
                              <strong>
                                {formatPrice(product.pret_engros)}
                              </strong>
                            </div>
                            <span>
                              RRP <br />
                              {formatPrice(product.pret_retail)}
                            </span>
                          </div>
                        </div>
                      </button>
                      <AddToCart product={product} />
                    </article>
                  ))}
                </div>
              )}
              {!loading && !error && total > 0 && (
                <nav className={s.pagination} aria-label="Paginare produse">
                  <div>
                    <button
                      disabled={currentPage === 1}
                      onClick={() => changePage(currentPage - 1)}
                      aria-label="Pagina precedenta"
                    >
                      ←
                    </button>
                    {[
                      ...new Set([
                        1,
                        currentPage - 1,
                        currentPage,
                        currentPage + 1,
                        pageCount,
                      ]),
                    ]
                      .filter((n) => n >= 1 && n <= pageCount)
                      .sort((a, b) => a - b)
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
                      aria-label="Pagina urmatoare"
                    >
                      →
                    </button>
                  </div>
                  <span>
                    {(currentPage - 1) * pageSize + 1}–
                    {Math.min(currentPage * pageSize, total)} din {total}
                  </span>
                </nav>
              )}
            </div>
          </div>
        </section>
        {!isCategoryPage && !user && (
          <section className={s.partner}>
            <div>
              <span className={s.eyebrow}>CRESTEM PRIN JOACA</span>
              <h2>Urmatorul capitol al magazinului tau.</h2>
              <p>
                Solicita un cont de partener ToyLogix. Echipa noastra va
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
        <p>Jucarii. Idei. Noi posibilitati.</p>
        <nav aria-label="Navigare subsol">
          <a href="#catalog">Catalog</a>
          <Link href="/account">Contul meu</Link>
        </nav>
        <small>© {new Date().getFullYear()} ToyLogix</small>
      </footer>
      {appearanceOpen && <ThemePicker close={() => setAppearanceOpen(false)} />}
      {isCategoryPage && filtersOpen && (
        <FilterDrawer close={() => setFiltersOpen(false)} count={total}>
          {filterControls}
        </FilterDrawer>
      )}
      {categoryOpen && (
        <CategoryDrawer
          categories={facetOptions("categorie")}
          current={isCategoryPage ? displayCategory : ""}
          close={() => setCategoryOpen(false)}
        />
      )}
      {favoritesOpen && (
        <FavoritesDialog
          products={favoriteProducts}
          loading={favoritesLoading}
          error={favoritesLoadError}
          favoriteError={favoriteError}
          close={() => setFavoritesOpen(false)}
          remove={toggleFavorite}
          openProduct={(product) => {
            setFavoritesOpen(false);
            setSelected(product);
          }}
        />
      )}
      {selected && (
        <ProductDetails
          key={selected.id}
          product={selected}
          close={() => setSelected(null)}
          isFavorite={favorites.includes(selected.id)}
          toggleFavorite={() => toggleFavorite(selected.id)}
          favoriteError={favoriteError}
        />
      )}
    </div>
  );
}

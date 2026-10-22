"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { productImages, type ProductCard } from "@/lib/catalog";
import { maxCartBoxes, cartTotals, lineTotals, money, validProduct } from "@/lib/order-request";
import { useCart } from "./useCart";
import ProductPicture from "./ProductPicture";
import s from "./cart.module.css";

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3h2l2.5 12h11L21 6H6M8 15l-1 3h12" />
      <circle cx="9" cy="21" r="1" /><circle cx="18" cy="21" r="1" />
    </svg>
  );
}

function QuantityControl({ product, boxes, change, disabled = false }: {
  product: ProductCard;
  boxes: number;
  change: (delta: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={s.quantity} role="group" aria-label={`Cantitate: ${product.nume_produs}`}>
      <button type="button" onClick={() => change(-1)} aria-label={`Scade o cutie: ${product.nume_produs}`}>−</button>
      <output aria-live="polite" aria-atomic="true">{boxes} <small>{boxes === 1 ? "cutie" : "cutii"}</small></output>
      <button type="button" disabled={disabled || boxes >= maxCartBoxes(product)} onClick={() => change(1)} aria-label={`Adauga o cutie: ${product.nume_produs}`}>+</button>
    </div>
  );
}

export function AddToCart({ product }: { product: ProductCard }) {
  const cart = useCart();
  const valid = validProduct(product);
  const max = maxCartBoxes(product);
  const boxes = cart.lines.find((line) => line.product.id === product.id)?.boxes ?? 0;
  return (
    <div className={s.add}>
      {boxes ? (
        <QuantityControl product={product} boxes={boxes} disabled={!valid} change={(delta) => cart.changeBoxes(product.id, delta, product)} />
      ) : (
        <button type="button" className={s.primary} disabled={!valid || max < 1} onClick={() => cart.add(product)}>
          Adauga in cos
        </button>
      )}
      <span role="status">{cart.error || (!valid ? "Pret sau ambalare nespecificata. Contacteaza ToyLogix." : max < 1 ? "Stoc insuficient pentru o cutie." : boxes >= max ? "Ai atins stocul maxim disponibil." : "")}</span>
    </div>
  );
}

export function CartLink() {
  return (
    <div className={s.banner}>
      <div className={s.bannerInner}>
        <span>Cerere de comanda B2B</span>
        <CartMenu />
      </div>
    </div>
  );
}

export function CartMenu() {
  const { lines } = useCart();
  const boxes = cartTotals(lines).boxes;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function positionPanel() {
    if (!trigger.current || !panel.current) return;
    const bounds = trigger.current.getBoundingClientRect();
    const top = bounds.bottom + 8;
    // Top-layer positioning keeps the menu above dialogs without clipping.
    panel.current.style.top = `${top}px`;
    panel.current.style.right = `${document.documentElement.clientWidth - bounds.right}px`;
    panel.current.style.width = `${Math.min(360, bounds.right - 16)}px`;
    panel.current.style.maxHeight = `${Math.max(0, window.innerHeight - top - 16)}px`;
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    const observer = new ResizeObserver(positionPanel);
    if (trigger.current) observer.observe(trigger.current);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
      observer.disconnect();
    };
  }, [open]);

  return (
    <>
      <button ref={trigger} type="button" popoverTarget={id} onClick={positionPanel}
        className={s.cartLink} aria-expanded={open} aria-controls={id}
        aria-label={`Cosul meu: ${boxes} ${boxes === 1 ? "cutie" : "cutii"}`}>
        <CartIcon /> Cosul meu <b className={s.badge} aria-live="polite" aria-atomic="true">{boxes}</b>
      </button>
      <div ref={panel} id={id} popover="auto" className={s.cartPopover}
        onToggle={(event) => setOpen(event.newState === "open")}>
        <MiniCart titleId={`${id}-title`} />
      </div>
    </>
  );
}

function MiniCart({ titleId }: { titleId: string }) {
  const cart = useCart();
  const total = cartTotals(cart.lines);
  return (
    <aside className={s.miniCart} aria-labelledby={titleId}>
      <div className={s.miniHeading}>
        <CartIcon /><h2 id={titleId}>Cosul meu</h2><b className={s.badge}>{total.boxes}</b>
      </div>
      <p className={s.miniCaption}>Totul pregatit pentru urmatorul pas.</p>
      {cart.lines.length ? (
        <ul className={s.miniLines}>
          {cart.lines.map((line) => (
            <li className={s.miniLine} key={line.product.id}>
              <div className={s.thumbnail}><ProductPicture src={productImages(line.product)[0]} name={line.product.nume_produs} /></div>
              <div className={s.miniDetails}>
                <h3>{line.product.nume_produs}</h3>
                <p>{line.product.bucati_per_cutie} buc. / cutie</p>
                <strong>{money(lineTotals(line).cents)}</strong>
              </div>
              <QuantityControl product={line.product} boxes={line.boxes} change={(delta) => cart.changeBoxes(line.product.id, delta)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={s.miniEmpty}><CartIcon /><strong>Cosul tau este gol</strong><p>Adauga produse din catalog pentru a pregati cererea de comanda.</p></div>
      )}
      <div className={s.miniSummary}>
        <p><span>Total cutii</span><strong>{total.boxes}</strong></p>
        <p><span>Total estimativ</span><strong>{money(total.cents)}</strong></p>
        {cart.lines.length ? <Link className={s.checkout} href="/store/cart">Finalizeaza comanda <span aria-hidden="true">→</span></Link> : <button className={s.checkout} disabled>Finalizeaza comanda</button>}
        <small>Preturile si disponibilitatea se confirma de ToyLogix.</small>
        {cart.error && <p role="alert">{cart.error}</p>}
      </div>
    </aside>
  );
}

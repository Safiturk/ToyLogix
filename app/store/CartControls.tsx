"use client";
import Link from "next/link";
import { useState } from "react";
import type { ProductCard } from "@/lib/catalog";
import { cartTotals, validProduct } from "@/lib/order-request";
import { useCart } from "./useCart";
import s from "./cart.module.css";

export function AddToCart({ product }: { product: ProductCard }) {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const valid = validProduct(product);
  return (
    <div className={s.add}>
      <button
        className={s.primary}
        disabled={!valid}
        onClick={() => setAdded(cart.add(product))}
      >
        Adaugă în coș
      </button>
      <span role="status">
        {cart.error ||
          (added
            ? "O cutie adăugată în coș."
            : !valid
              ? "Preț sau ambalare nespecificată. Contactează ToyLogix."
              : "")}
      </span>
    </div>
  );
}
export function CartLink() {
  const { lines } = useCart();
  return (
    <div className={s.banner}>
      <span>Cerere de comandă B2B</span>
      <Link href="/store/cart">
        Coșul meu · {cartTotals(lines).boxes} cutii →
      </Link>
    </div>
  );
}

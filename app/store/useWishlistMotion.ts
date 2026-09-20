"use client";

import { useCallback, useEffect, useRef } from "react";
import s from "../customer.module.css";

export function useWishlistMotion() {
  const active = useRef(new Set<() => void>());
  const cancel = useCallback(() => {
    for (const cleanup of active.current) cleanup();
    active.current.clear();
  }, []);
  useEffect(() => cancel, [cancel]);

  const bounce = useCallback((element: HTMLElement | SVGElement | null) => {
    if (!element?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    element.getAnimations().forEach((animation) => animation.cancel());
    const animation = element.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.25)", offset: 0.45 }, { transform: "scale(1)" }],
      { duration: 320, easing: "ease-in-out" },
    );
    const cleanup = () => { animation.cancel(); active.current.delete(cleanup); };
    active.current.add(cleanup);
    animation.onfinish = cleanup;
    animation.oncancel = () => active.current.delete(cleanup);
  }, []);

  const fly = useCallback((source: HTMLElement, target: HTMLElement | null, badge: HTMLElement | null) => {
    if (!target || !source.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = source.getBoundingClientRect();
    const end = target.getBoundingClientRect();
    if (!start.width || !end.width || end.bottom < 0 || end.top > window.innerHeight) return;
    const thumbnail = document.createElement("div");
    thumbnail.className = s.wishlistFlight;
    thumbnail.setAttribute("aria-hidden", "true");
    const original = source.querySelector("img");
    if (original?.complete && original.naturalWidth) {
      const clone = original.cloneNode(false) as HTMLImageElement;
      clone.removeAttribute("id");
      clone.removeAttribute("class");
      clone.alt = "";
      clone.loading = "eager";
      thumbnail.append(clone);
    } else {
      thumbnail.textContent = "♥";
    }
    const x = start.left + start.width / 2 - 28;
    const y = start.top + start.height / 2 - 28;
    thumbnail.style.left = `${x}px`;
    thumbnail.style.top = `${y}px`;
    document.body.append(thumbnail);
    const dx = end.left + end.width / 2 - (x + 28);
    const dy = end.top + end.height / 2 - (y + 28);
    // Sample a quadratic curve so the thumbnail arcs gently toward the header.
    const frames = Array.from({ length: 25 }, (_, index) => {
      const t = index / 24;
      const bend = Math.min(100, Math.abs(dx) * 0.15 + 40);
      const tx = dx * t + 2 * (1 - t) * t * bend;
      const ty = dy * t - 2 * (1 - t) * t * 90;
      return { transform: `translate(${tx}px, ${ty}px) scale(${1 - 0.88 * t})`, opacity: t < 0.85 ? 1 : (1 - t) / 0.15, offset: t };
    });
    const animation = thumbnail.animate(frames, { duration: 680, easing: "cubic-bezier(.25,.1,.25,1)", fill: "forwards" });
    const cleanup = () => { animation.cancel(); thumbnail.remove(); active.current.delete(cleanup); };
    active.current.add(cleanup);
    animation.onfinish = () => { cleanup(); bounce(badge); };
    animation.oncancel = () => { thumbnail.remove(); active.current.delete(cleanup); };
  }, [bounce]);

  return { fly, bounce, cancel };
}

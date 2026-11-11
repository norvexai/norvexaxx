import { useEffect, useRef, useState } from "react";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Adds `in` state once the element scrolls into view (runs once). */
export function useInView(options = { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) { setSeen(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, options);
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** Animates a number from its previous value to `target` (cents, counts, ...). */
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); from.current = target; return; }
    const start = performance.now();
    const origin = from.current;
    let raf;
    const tick = now => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(Math.round(origin + (target - origin) * eased));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > offset);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [offset]);
  return scrolled;
}

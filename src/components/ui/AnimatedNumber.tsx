"use client";

import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

/** Numeric counter that eases to its new value (instant under prefers-reduced-motion). */
export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const unsub = mv.on("change", (v) => {
      if (ref.current) ref.current.textContent = fmt(v);
    });
    if (reduce) {
      mv.set(value);
      if (ref.current) ref.current.textContent = fmt(value);
    } else {
      const controls = animate(mv, value, { type: "spring", stiffness: 140, damping: 20, mass: 0.6 });
      return () => {
        controls.stop();
        unsub();
      };
    }
    return unsub;
  }, [value, decimals, mv, reduce]);
  return (
    <span ref={ref} className={className}>
      {value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

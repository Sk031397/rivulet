"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  /** Delay before the entrance begins, in ms. Useful for staggering siblings. */
  delay?: number;
  /** Direction the element travels from as it fades in. */
  from?: "up" | "down" | "left" | "right" | "none";
  /** Render as a different element/tag (defaults to div). */
  as?: ElementType;
  className?: string;
  /** Fraction of the element that must be visible before it animates in. */
  threshold?: number;
};

const OFFSET: Record<NonNullable<RevealProps["from"]>, string> = {
  up: "translate-y-6",
  down: "-translate-y-6",
  left: "translate-x-6",
  right: "-translate-x-6",
  none: "",
};

/**
 * Fades its children in (with optional directional travel) the first time they
 * scroll into view. Animation only runs once. Reduced-motion users get the
 * final state immediately via the global CSS guard.
 */
export default function Reveal({
  children,
  delay = 0,
  from = "up",
  as: Tag = "div",
  className = "",
  threshold = 0.15,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <Tag
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ease-out ${
        visible ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${OFFSET[from]}`
      } ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </Tag>
  );
}

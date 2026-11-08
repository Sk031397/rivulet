"use client";

import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export default function UseCaseCard({ icon: Icon, title, text, fallback }: { icon: LucideIcon; title: string; text: string; img?: string; fallback: string }) {
  const ref = useRef<HTMLElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [spot, setSpot] = useState({ x: 50, y: 50, on: false });

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height; // 0..1
    setTilt({ ry: (px - 0.5) * 10, rx: -(py - 0.5) * 10 });
    setSpot({ x: px * 100, y: py * 100, on: true });
  };

  const onLeave = () => {
    setTilt({ rx: 0, ry: 0 });
    setSpot((s) => ({ ...s, on: false }));
  };

  return (
    <article
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ transform: `perspective(700px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
      className={`group relative flex h-[140px] items-end overflow-hidden rounded-2xl bg-gradient-to-br ${fallback} shadow-lg shadow-ink/15 transition-[transform,box-shadow] duration-200 ease-out hover:shadow-2xl hover:shadow-ink/30 sm:h-[165px]`}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />

      {/* Cursor-following spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: spot.on ? 1 : 0,
          background: `radial-gradient(260px circle at ${spot.x}% ${spot.y}%, rgba(255,255,255,0.28), transparent 60%)`,
        }}
      />

      <div className="relative flex items-center gap-3 p-4 text-white">
        <Icon className="size-9 shrink-0 text-saffron transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110" />
        <div>
          <h3 className="text-sm font-extrabold">{title}</h3>
          <p className="text-xs text-white/90">{text}</p>
        </div>
      </div>
    </article>
  );
}

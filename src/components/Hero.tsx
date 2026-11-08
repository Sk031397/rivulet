"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Play, X } from "lucide-react";
import Mark from "./Mark";
import FlowMock from "./FlowMock";
import { BRAND } from "@/data/content";

/**
 * Demo video source. Pick ONE of the following shapes:
 *
 *  - YouTube:  { type: "youtube", id: "dQw4w9WgXcQ" }   // the id after ?v= or youtu.be/
 *  - Vimeo:    { type: "vimeo",   id: "123456789" }      // the numeric id
 *  - Local:    { type: "file",    src: "/demo.mp4" }     // a file placed in /public
 *
 * Set to `null` to keep the modal hidden-ready until you have a video.
 */
const DEMO_VIDEO:
  | { type: "youtube"; id: string }
  | { type: "vimeo"; id: string }
  | { type: "file"; src: string }
  | null = { type: "file", src: "/assets/hero.mp4" };

function DemoPlayer() {
  if (!DEMO_VIDEO || ("id" in DEMO_VIDEO && !DEMO_VIDEO.id) || ("src" in DEMO_VIDEO && !DEMO_VIDEO.src)) {
    return (
      <div className="grid aspect-video w-full place-items-center bg-ink/90 text-center text-sm text-white/60">
        <div className="px-6">
          <Play className="mx-auto mb-3 size-8 opacity-60" />
          <p>No demo video configured yet.</p>
          <p className="mt-1 text-xs text-white/40">
            Set <code className="rounded bg-white/10 px-1">DEMO_VIDEO</code> in <code className="rounded bg-white/10 px-1">Hero.tsx</code>.
          </p>
        </div>
      </div>
    );
  }

  if (DEMO_VIDEO.type === "file") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={DEMO_VIDEO.src}
        controls
        autoPlay
        playsInline
        className="aspect-video w-full bg-black"
      />
    );
  }

  const embedSrc =
    DEMO_VIDEO.type === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${DEMO_VIDEO.id}?autoplay=1&rel=0`
      : `https://player.vimeo.com/video/${DEMO_VIDEO.id}?autoplay=1`;

  return (
    <iframe
      src={embedSrc}
      title={`${BRAND.name} demo video`}
      className="aspect-video w-full bg-black"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

function DemoModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    // lock background scroll while the modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How Rivulet works"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* panel */}
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-ink/30">
        {/* header */}
        <div className="flex items-center justify-between bg-ink px-8 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Watch demo</p>
            <h2 className="font-display text-xl font-bold text-white">See {BRAND.name} in action</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close demo"
            className="grid size-9 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* video */}
        <DemoPlayer />

        {/* footer */}
        <div className="flex items-center justify-end gap-4 px-8 py-5">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full bg-ultra px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ink"
          >
            Try it now <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Hero() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  // Subtle pointer parallax for the background gradient blobs.
  const onPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const { innerWidth, innerHeight } = window;
    const x = (e.clientX / innerWidth - 0.5) * 2; // -1 .. 1
    const y = (e.clientY / innerHeight - 0.5) * 2;
    setParallax({ x, y });
  };

  return (
    <section
      onMouseMove={onPointerMove}
      className="relative isolate overflow-hidden bg-paper"
    >
      <div
        aria-hidden="true"
        className="animate-blob absolute -right-48 -top-32 -z-10 h-[640px] w-[920px] rounded-full bg-gradient-to-br from-ultra via-ultra to-coral opacity-90 blur-2xl transition-transform duration-300 ease-out"
        style={{ transform: `translate3d(${parallax.x * -24}px, ${parallax.y * -24}px, 0)` }}
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-10 left-1/2 -z-10 h-32 w-[140%] -translate-x-1/2 rounded-[50%] bg-white blur-2xl transition-transform duration-300 ease-out"
        style={{ transform: `translate3d(calc(-50% + ${parallax.x * 16}px), ${parallax.y * 10}px, 0)` }}
      />

      {/* Minimal brand bar — nav removed */}
      <div className="relative z-20 mx-auto flex max-w-7xl items-center px-6 py-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} home`}>
          <Mark />
          <span className="font-display text-xl font-bold tracking-tight text-ink">{BRAND.name}</span>
        </Link>
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-6 lg:grid-cols-2 lg:px-8 lg:pb-32">
        <div>
          <h1 className="animate-fade-up font-display text-5xl font-bold leading-[1.02] tracking-tight text-ink sm:text-6xl">
            {BRAND.name}
            <span className="block text-ultra">{BRAND.tagline}</span>
          </h1>
          <p className="animate-fade-up delay-150 mt-6 max-w-md text-lg leading-relaxed text-ink/75">
            Describe your idea and AI builds the payment flow: collect, split, and pay out on your conditions, all in one place.
          </p>
          <div className="animate-fade-up delay-300 mt-8 flex flex-wrap items-center gap-6">
            <Link href="/dashboard" className="group inline-flex items-center gap-2 rounded-full bg-ultra px-7 py-3.5 font-display font-bold text-white shadow-lg shadow-ultra/30 transition hover:bg-ink hover:shadow-xl hover:shadow-ultra/40 hover:-translate-y-0.5">
              Create your flow <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="group inline-flex items-center gap-2 font-semibold text-ink transition hover:text-ultra"
            >
              <span className="grid size-9 place-items-center rounded-full border-2 border-current transition duration-200 group-hover:scale-110 group-hover:bg-ultra/10">
                <Play className="size-3.5 fill-current" />
              </span>
              Watch demo
            </button>
          </div>
        </div>
        <div className="animate-fade-up delay-500">
          <FlowMock />
        </div>
      </div>

      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
    </section>
  );
}

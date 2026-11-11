"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { STEPS } from "@/data/content";

export default function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" ref={ref} className="bg-paper px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-5xl text-center">
        <h2
          className={`font-display text-3xl font-bold tracking-tight text-ink transition-[opacity,transform] duration-500 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          Describe the trip. We'll handle the money.
        </h2>

        <ol className="mt-12 grid items-start gap-10 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="contents">
              {/* Step card */}
              <div
                className={`group text-center transition-[opacity,transform] duration-500 ease-out ${
                  visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: visible ? `${i * 150}ms` : "0ms" }}
              >
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-ultra text-white shadow-lg shadow-ultra/30 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:shadow-xl group-hover:shadow-ultra/40">
                  <Icon className="size-6" />
                </span>
                <h3 className="mt-4 font-extrabold text-ink transition-colors duration-200 group-hover:text-ultra">{i + 1}. {title}</h3>
                <p className="mx-auto mt-1 max-w-[230px] text-sm leading-relaxed text-ink/70">{text}</p>
              </div>

              {/* Animated connector arrow */}
              {i < STEPS.length - 1 && (
                <div
                  className={`mt-5 hidden md:block transition-[opacity,transform] duration-300 ease-out ${
                    visible ? "opacity-100 scale-100" : "opacity-0 scale-50"
                  }`}
                  style={{ transitionDelay: visible ? `${i * 150 + 200}ms` : "0ms" }}
                  aria-hidden="true"
                >
                  <ArrowRight className="size-5 text-coral" />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

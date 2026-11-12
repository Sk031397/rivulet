import Reveal from "@/components/Reveal";

/**
 * The problem, in numbers. Figures are from Zelle's 2026 "Avoidance Economy"
 * report (survey of Gen Z consumers), as published by Zelle on PR Newswire.
 * Keep the source link visible: these are someone else's numbers, not ours.
 */
const SOURCE_URL =
  "https://www.prnewswire.com/news-releases/zelle---the-avoidance-economy-why-americans-are-ghosting-payment-requests-302847557.html";

const STATS = [
  { value: "76%", text: "who fronted money for a group trip were not fully repaid" },
  { value: "47%", text: "have gone into debt covering group expenses" },
  { value: "55%", text: "who fronted trip money say it created tension or hurt a relationship" },
];

export default function ProblemStats() {
  return (
    <section aria-labelledby="problem-heading" className="bg-ink px-6 py-20 text-white lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-saffron">The problem</p>
          <h2 id="problem-heading" className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Someone always fronts the money. Most don&apos;t get it all back.
          </h2>
        </Reveal>

        <dl className="mt-12 grid gap-4 sm:grid-cols-3">
          {STATS.map((s, i) => (
            <Reveal key={s.value} delay={i * 120}>
              <div className="h-full rounded-3xl bg-white/[0.06] p-7 ring-1 ring-white/10 backdrop-blur">
                <dt className="sr-only">{s.text}</dt>
                <dd>
                  <span className="block font-display text-5xl font-bold tracking-tight text-transparent bg-gradient-to-r from-saffron to-coral bg-clip-text">
                    {s.value}
                  </span>
                  <span className="mt-3 block text-base leading-relaxed text-white/75">of Gen Z {s.text}.</span>
                </dd>
              </div>
            </Reveal>
          ))}
        </dl>

        <p className="mt-6 text-xs text-white/45">
          Source:{" "}
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white">
            Zelle, The Avoidance Economy report (2026)
          </a>
          , survey of Gen Z consumers.
        </p>
      </div>
    </section>
  );
}

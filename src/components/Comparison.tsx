import { Check, Minus } from "lucide-react";
import Reveal from "@/components/Reveal";

/**
 * "Doesn't this already exist?" Splitting apps track who owes what after one
 * person has paid; pooling tools collect money upfront into the organizer's
 * account. Rivulet's difference is what happens after the money is collected.
 * Only list what Rivulet does, and describe the other categories generally,
 * so nothing here is a claim about a competitor's exact feature set.
 */
const ROWS: Array<{ label: string; split: boolean; pool: boolean }> = [
  { label: "Collect each person's share upfront", split: false, pool: true },
  { label: "Plan the whole trip from one sentence or an invoice (AI)", split: false, pool: false },
  { label: "Pay the villa, flights and dinner directly when the pot is full", split: false, pool: false },
  { label: "Pay on a date, or hold until you approve", split: false, pool: false },
  { label: "Refund everyone automatically if the deadline is missed", split: false, pool: false },
  { label: "The organizer never holds everyone's money", split: false, pool: false },
];

function Cell({ yes, highlight = false }: { yes: boolean; highlight?: boolean }) {
  return (
    <td className={`px-4 py-4 text-center ${highlight ? "bg-ultra/[0.06]" : ""}`}>
      {yes ? (
        <Check className={`mx-auto size-5 ${highlight ? "text-ultra" : "text-ink/50"}`} aria-label="Yes" />
      ) : (
        <Minus className="mx-auto size-5 text-ink/20" aria-label="No" />
      )}
    </td>
  );
}

export default function Comparison() {
  return (
    <section aria-labelledby="compare-heading" className="bg-white px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">Why Rivulet</p>
          <h2 id="compare-heading" className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Other apps stop once the money is in. Rivulet finishes the job.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-ink/65">
            Splitting apps track who owes what after someone has already paid. Pooling tools collect the money, then
            leave the organizer holding it to pay every vendor by hand. Rivulet pays the vendors and returns the money if
            the trip falls through.
          </p>
        </Reveal>

        <Reveal delay={150}>
          <div className="mt-10 overflow-x-auto rounded-3xl ring-1 ring-ink/10">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">How Rivulet compares with bill-splitting apps and money pools</caption>
              <thead>
                <tr className="border-b border-ink/10 bg-paper">
                  <th scope="col" className="px-6 py-4 font-semibold text-ink/60">What you get</th>
                  <th scope="col" className="px-4 py-4 text-center font-semibold text-ink/60">Bill-splitting apps</th>
                  <th scope="col" className="px-4 py-4 text-center font-semibold text-ink/60">Money pools</th>
                  <th scope="col" className="bg-ultra px-4 py-4 text-center font-display font-bold text-white">Rivulet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {ROWS.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="px-6 py-4 font-medium text-ink">{r.label}</th>
                    <Cell yes={r.split} />
                    <Cell yes={r.pool} />
                    <Cell yes highlight />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import { auth } from "@clerk/nextjs/server";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import UseCases from "@/components/UseCases";
import HowItWorks from "@/components/HowItWorks";
import CTA from "@/components/CTA";
import { getAllFlows } from "@/lib/store";
import { toPublicFlow, type PublicFlow } from "@/lib/publicFlow";

// The hero depends on who is looking, so this page must render per request. (Without
// this, the try/catch below hides Next's "dynamic usage" signal and the page is
// prerendered once, with no flow, for everyone.)
export const dynamic = "force-dynamic";

/**
 * The signed-in visitor's own most recent flow, for the hero illustration.
 * Returns null for everyone else, and on any failure (no session, database
 * unreachable) — the hero then shows the demo video instead. Only the public
 * projection is passed on: no recipients, no owner id.
 */
async function latestFlowForHero(): Promise<PublicFlow | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const [latest] = await getAllFlows(userId); // newest first
    return latest ? toPublicFlow(latest) : null;
  } catch (err) {
    console.error("[landing] could not load the visitor's latest flow:", err);
    return null;
  }
}

export default async function LandingPage() {
  const flow = await latestFlowForHero();

  return (
    <div className="min-h-screen bg-white font-sans text-ink antialiased">
      <Hero flow={flow} />
      <main>
        <Features />
        <UseCases />
        <HowItWorks />
        <CTA />
      </main>
    </div>
  );
}

import Hero from "@/components/Hero";
import Features from "@/components/Features";
import UseCases from "@/components/UseCases";
import HowItWorks from "@/components/HowItWorks";
import CTA from "@/components/CTA";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-ink antialiased">
      <Hero />
      <main>
        <Features />
        <UseCases />
        <HowItWorks />
        <CTA />
      </main>
    </div>
  );
}

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Mark from "@/components/Mark";
import { BRAND } from "@/data/content";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-paper px-4 font-sans text-ink antialiased">
      {/* background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 -z-10 h-[500px] w-[700px] rounded-full bg-gradient-to-br from-ultra via-ultra to-coral opacity-60 blur-3xl"
      />

      {/* back to site */}
      <Link
        href="/"
        className="absolute left-6 top-6 flex items-center gap-1.5 text-sm font-semibold text-ink/60 transition hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back to site
      </Link>

      <div className="w-full max-w-sm">
        {/* logo + heading */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link href="/" aria-label={`${BRAND.name} home`}>
            <Mark className="size-14 rounded-2xl" />
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              Sign in to {BRAND.name}
            </h1>
            <p className="mt-1 text-sm text-ink/55">
              Enter your account to access your dashboard.
            </p>
          </div>
        </div>

        {/* Clerk sign-in — appearance overrides to match the design system */}
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/dashboard"
          appearance={{
            variables: {
              colorPrimary:    "#3d3df5",
              colorBackground: "#ffffff",
              colorInputBackground: "#f6f4ff",
              colorText:       "#15133d",
              borderRadius:    "1rem",
              fontFamily:      "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
            },
            elements: {
              card:                  "shadow-xl shadow-ink/10 ring-1 ring-ink/5 rounded-3xl",
              headerTitle:           "hidden",
              headerSubtitle:        "hidden",
              socialButtonsBlockButton: "rounded-2xl ring-1 ring-ink/10 font-semibold",
              formButtonPrimary:     "rounded-full bg-ink hover:bg-ultra font-bold",
              footerActionLink:      "text-ultra font-semibold hover:text-ink",
              formFieldInput:        "rounded-2xl bg-paper ring-1 ring-ink/10 focus:ring-ultra",
              formFieldLabel:        "font-bold text-ink",
            },
          }}
        />
      </div>
    </div>
  );
}

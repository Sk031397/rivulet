import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Space_Grotesk, Sora } from "next/font/google";
import "./globals.css";

// Expressive geometric display face for headings.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Characterful, modern sans for body copy.
const body = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rivulet — Let money find its way.",
  description:
    "Describe your idea and AI builds the payment flow: collect, split, and pay out on your conditions, all in one place.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${display.variable} ${body.variable}`}>
        <body className="font-sans text-ink antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}

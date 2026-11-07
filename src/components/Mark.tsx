"use client";

import { Droplets } from "lucide-react";

export default function Mark({ className = "size-9" }: { className?: string }) {
  return (
    <span className={`grid place-items-center rounded-xl bg-gradient-to-br from-ultra to-coral text-white shadow-md shadow-ultra/30 ${className}`}>
      <Droplets className="size-1/2" />
    </span>
  );
}

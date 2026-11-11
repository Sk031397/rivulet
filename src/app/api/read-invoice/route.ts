import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { MODEL_ID, makeBedrock } from "@/lib/bedrock";
import { INVOICE_TYPES, MAX_INVOICE_BYTES, invoicePrompt, readInvoice } from "@/lib/invoice";

/**
 * POST /api/read-invoice
 * Body: { image: <base64, no data: prefix>, mediaType: "image/png" | "image/jpeg" | "image/webp" }
 *
 * Signed-in only. Reads a booking confirmation or invoice and returns the plain
 * fields it found plus a one-line prompt for the organizer to review and edit.
 * It creates nothing and moves no money.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const mediaType = INVOICE_TYPES.find((t) => t === body.mediaType);
  if (!mediaType) {
    return Response.json({ error: "Upload a PNG, JPEG or WebP image of the invoice." }, { status: 400 });
  }
  if (typeof body.image !== "string" || body.image.length === 0) {
    return Response.json({ error: "image is required" }, { status: 400 });
  }
  const bytes = Buffer.from(body.image, "base64");
  if (bytes.length === 0 || bytes.length > MAX_INVOICE_BYTES) {
    return Response.json({ error: "That image is too large. Keep it under 2.5 MB." }, { status: 413 });
  }

  try {
    const invoice = await readInvoice(makeBedrock()(MODEL_ID), new Uint8Array(bytes), mediaType);
    if (!invoice) {
      return Response.json(
        { error: "I couldn't read a payee or an amount from that image. Try a clearer photo, or type it in." },
        { status: 422 },
      );
    }
    return Response.json({ invoice, prompt: invoicePrompt(invoice) });
  } catch (err) {
    console.error("[read-invoice] failed:", err);
    const msg = String((err as Error)?.message ?? err).toLowerCase();
    if (msg.includes("throttl") || msg.includes("429") || msg.includes("too many")) {
      return Response.json({ error: "AWS Bedrock is busy. Wait a few seconds and try again." }, { status: 429 });
    }
    return Response.json({ error: "Couldn't read that invoice. Try again, or type it in." }, { status: 500 });
  }
}

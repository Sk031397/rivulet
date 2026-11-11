/** What the invoice reader accepts. Kept apart so the browser can use it without the AI SDK. */
export const MAX_INVOICE_BYTES = 2.5 * 1024 * 1024;
export const INVOICE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

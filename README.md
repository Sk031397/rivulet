# Rivulet

A Next.js 15 (App Router) + Tailwind CSS v4 + TypeScript app. Describe an idea and the AI builds a payment flow — collect, split, and pay out on your conditions, powered by PayPal.

```bash
npm install
npm run dev      # start dev server at http://localhost:3000
npm run build     # production build (output in /.next)
npm run start     # serve the build (uses PORT, default 3000; .env.example sets 3001)
```

## Configuration

Copy `.env.example` to `.env`. Leave credentials blank to run in **MOCK mode** (no real AI and no real PayPal API calls — the UI still works with sample data).

- `OPENAI_API_KEY` — drives the flow-building LLM. Blank → deterministic mock flow builder.
- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` — PayPal sandbox/production credentials for the "watch it run" layer.
- `PAYPAL_ENVIRONMENT` — `SANDBOX` (default) or `PRODUCTION`.

## Where things live

- `src/app/` — App Router pages. `page.tsx` is the landing page; `dashboard/` has overview, flows, payments, people, templates, and settings.
- `src/app/api/` — route handlers: `build-flow` (LLM flow builder), `activity`, and `stats` (both fall back to mock data when PayPal creds are absent or calls fail).
- `src/components/` — landing sections; `components/dashboard/` has the dashboard pieces.
- `src/data/` — `content.ts` (brand, nav, features, use cases, steps) and `dashboard.ts` (sample flows, stats, activity, payments, people, templates).
- `src/lib/` — `flow.ts` (zod schema + mock builder), `paypal.ts` (PayPal REST helpers), `mock.ts` (fallback data).
- `public/images/` — use-case photos (see README.txt there).

To rename the brand, edit `BRAND` in `src/data/content.ts` (and the `title` in `src/app/layout.tsx` metadata).

> Note: this project was migrated from an earlier Vite build. The original Vite source (hash-routed pages, `useHashRoute`, `.jsx`/`.js` modules) has been moved to `.vite-legacy/` for reference and is not part of the build.
# rivulet

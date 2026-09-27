import type { NextConfig } from "next";

/**
 * Sent on every response.
 *
 * The CSP is deliberately strict about where code and data may come from, with
 * two concessions the app genuinely needs:
 *  - `blob:` in script-src/frame-src, because the live preview renders the PDF
 *    in the browser and shows it through a blob URL.
 *  - `'unsafe-inline'` for styles, which Next's streaming requires today.
 * Scripts get `'strict-dynamic'` with a nonce in a later pass; until then
 * `'self'` still blocks every third-party origin.
 */
// Next's dev server rebuilds modules with eval; a production bundle never
// needs it, and leaving it on would hand any injected script the easiest
// possible route to running arbitrary code.
const DEV_ONLY_EVAL = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV_ONLY_EVAL} blob:`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nothing here should ever be embedded elsewhere: invoices are private.
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const config: NextConfig = {
  poweredByHeader: false,
  /*
   * pdfkit, underneath @react-pdf, loads the metrics for the standard PDF
   * fonts with a require it builds at runtime. Vercel's file tracing follows
   * imports it can see, so those files were left out of the deployed function
   * and every invoice failed with "Cannot find module … standard-fonts/
   * Helvetica.cjs" — while working locally, where node_modules is simply there.
   *
   * 29 files, 182 KB. Named precisely rather than by a wildcard over the
   * package: a broad glob here is what made an earlier deploy too large to
   * upload at all.
   */
  outputFileTracingIncludes: Object.fromEntries(
    // Every function that can draw a PDF: the download route, and the two
    // pages whose server actions email or share one.
    ["/invoices/[id]/pdf", "/invoices/[id]", "/invoices"].map((route) => [
      route,
      ["./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts/*"],
    ]),
  ),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No feature here needs any of these.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        // An invoice PDF is a private document: never cached by a proxy, never
        // kept in the browser's disk cache after sign-out.
        source: "/invoices/:id/pdf",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default config;

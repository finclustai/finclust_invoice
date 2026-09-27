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
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
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

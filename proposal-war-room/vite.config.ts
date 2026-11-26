import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

const SUPABASE_HOST = "hqqwlkmggwgaoiyzgrhy.supabase.co";

/** The built page gets a content security policy. The dev server does not: its hot reload needs inline scripts. */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "war-room-csp",
    apply: "build",
    transformIndexHtml: html => html.replace("<meta charset=\"utf-8\" />", `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

// The site is served from a folder on GitHub Pages and, in the browser tests, from this folder's dist/.
// Relative asset addresses work at both.
export default defineConfig({
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // The kit's tokens are OKLCH values. Browsers from 2023 on read them as written. An older CSS target makes the
    // build add its own hex fallbacks, and its rounding is not the kit's (Flare came out as #e4fcff, not #E2FDFF).
    cssTarget: ["chrome120", "edge120", "firefox128", "safari17"],
    sourcemap: false,
    // The wordmark and sprite stay files, so the published page serves the supplied artwork byte for byte.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5183, strictPort: true },
});

import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// CSP: everything is same-origin (offline-capable). Fonts and the PDF worker are self-hosted.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3", "sharp", "pdf-lib", "qrcode"],
  async rewrites() {
    return [{ source: "/healthz", destination: "/api/health" }];
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    return [
      {
        source: "/((?!api/files).*)",
        headers: isProd ? [...common, { key: "Content-Security-Policy", value: csp }] : common,
      },
    ];
  },
};

export default nextConfig;

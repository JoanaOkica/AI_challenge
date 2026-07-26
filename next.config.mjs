/**
 * Security headers.
 *
 * The app renders attorney work product and embeds third-party document
 * previews, so the policy is deliberately tight:
 *   - frame-ancestors 'none'  -> the portal cannot be iframed (clickjacking)
 *   - frame-src allowlist     -> previews may only come from Google Drive/Docs
 *   - connect-src 'self'      -> the browser never talks to an inference API
 *                                directly; only our own server routes do
 *   - object-src 'none'       -> no plugin escape hatches
 */
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Bridges the Worker bindings from wrangler.jsonc into `next dev`.
 *
 * Deliberately opt-in. Workers AI has no local emulator, so the AI binding is
 * declared `remote: true` and this call opens a live session against the real
 * Cloudflare account — which fails hard without a logged-in wrangler. Running
 * it unconditionally would mean nobody could start the dev server, or run a
 * build in CI, without Cloudflare credentials, to work on a dashboard that
 * never calls a model.
 *
 * So: plain `npm run dev` leaves the binding absent and the three AI routes
 * answer 503 with a clear message. To exercise them locally:
 *
 *   npx wrangler login
 *   NEXT_DEV_REMOTE_BINDINGS=1 npm run dev
 */
if (isDev && process.env.NEXT_DEV_REMOTE_BINDINGS === '1') {
  initOpenNextCloudflareForDev();
}

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; dev additionally needs eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  'frame-src https://drive.google.com https://docs.google.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework/version
  // The OpenNext adapter packages `.next/standalone` into the Cloudflare Worker.
  // Declaring it here means the ordinary `next build` already emits what the
  // adapter needs, so the deploy step never has to rebuild the app.
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
      {
        // Never let a proxy or browser cache a generated legal draft.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;

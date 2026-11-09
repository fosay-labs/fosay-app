import type { NextConfig } from 'next';

// `FOSAY_STATIC_EXPORT=1` builds a static site (GitHub Pages); otherwise a normal Next server.
// NEXT_PUBLIC_BASE_PATH is the path the site is served under, e.g. `/fosay-app` on Pages.
const staticExport = process.env.FOSAY_STATIC_EXPORT === '1';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const nextConfig: NextConfig = {
  // @fosay/sdk ships TypeScript sources from the workspace
  transpilePackages: ['@fosay/sdk'],
  reactStrictMode: true,
  poweredByHeader: false,
  ...(basePath ? { basePath } : {}),
  ...(staticExport
    ? { output: 'export', trailingSlash: true }
    : {
        // response headers need a server; static hosts set their own
        async headers() {
          return [{ source: '/(.*)', headers: securityHeaders }];
        },
      }),
};

export default nextConfig;

/** @type {import('next').NextConfig} */
import path from 'path';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    // Map `@/...` imports to the `src/` directory for consistent resolution
    config.resolve.alias['@'] = path.resolve(process.cwd(), 'src');
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  serverActions: {
    bodySizeLimit: '20mb',
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()"
      }
    ];

    // Restore Strict-Transport-Security (HSTS) for defense-in-depth behind Azure Ingress.
    // We only omit it during local development to avoid HTTP->HTTPS upgrade loops on custom local domains.
    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload"
      });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;

/** @type {import('next').NextConfig} */
import path from 'path';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    // Map `@/...` imports to the `src/` directory for consistent resolution
    config.resolve.alias['@'] = path.resolve(process.cwd(), 'src');
    return config;
  },
  async headers() {
    // Security headers are consolidated here for consistency across environments.
    // HSTS is included; browsers will ignore it on local HTTP but respect it when relayed via an HTTPS Ingress or Reverse Proxy.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload"
          }
        ]
      }
    ];
  }
};

export default nextConfig;

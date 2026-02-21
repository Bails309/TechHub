/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()"
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              "img-src 'self' data: blob: https:; " +
              "style-src 'self' 'unsafe-inline' https:; " +
              "font-src 'self' https: data:; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
              "connect-src 'self' https:; " +
              "frame-ancestors 'self';"
          }
        ]
      }
    ];
  }
};

export default nextConfig;

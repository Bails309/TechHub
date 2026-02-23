Proxy trust and header handling

Overview

When running TechHub behind a reverse proxy or load balancer (e.g., AWS ALB, nginx, Cloudflare), the proxy typically sets headers such as `X-Forwarded-For` or `X-Client-Ip` to surface the original client's IP address. These headers are controlled by the proxy and can be spoofed by untrusted clients unless the application only accepts them from known, trusted proxy IPs.

Recommended configuration

- `TRUST_PROXY` (boolean): set to `true` when the application is behind a single trusted reverse proxy that correctly sets `X-Forwarded-For` and removes client-supplied header duplicates. When `true`, TechHub will parse `X-Forwarded-For` to extract the first public IP.

- `TRUSTED_PROXIES` (optional, suggested): a comma-separated list of CIDRs or IPs that are considered trusted proxies (example: `10.0.0.0/8,203.0.113.5`). When provided, TechHub will only accept `X-Client-Ip` or `X-Forwarded-For` when the request originates from one of these trusted proxies.

Security guidance

- Never trust `X-Client-Ip` or `X-Forwarded-For` coming from arbitrary clients. If `TRUST_PROXY` is not enabled or the remote IP is not in `TRUSTED_PROXIES`, these headers will be ignored.

- If your deployment uses a managed platform (Vercel, Netlify, etc.), follow the provider guidance for trusted proxy addresses and set `TRUST_PROXY` accordingly.

- For multi-tier proxy topologies (CDN + LB + app proxy), prefer providing `TRUSTED_PROXIES` with the immediate proxy IP ranges rather than relying on client-supplied headers.

Implementation notes

- TechHub provides helper utilities (to be added) that parse `X-Forwarded-For`, normalize IPs, and check whether the immediate remote IP is in the `TRUSTED_PROXIES` list.

- Rate limiting and audit logs should always be based on server-validated client IPs. Avoid allowing unauthenticated clients to bypass rate limits by spoofing headers.

Example (env):

```env
TRUST_PROXY=true
TRUSTED_PROXIES=10.0.0.0/8,192.168.0.0/16
```

If you'd like, I can add the `TRUSTED_PROXIES` parsing helper and wire it into `src/lib/auth.ts` next.

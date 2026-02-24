Proxy trust and header handling
````markdown
Proxy trust and header handling

Overview

When running TechHub behind a reverse proxy or load balancer (e.g., AWS ALB, nginx, Cloudflare), the proxy typically sets headers such as `X-Forwarded-For` or `X-Client-Ip` to surface the original client's IP address. These headers are controlled by the proxy and can be spoofed by untrusted clients unless the application only accepts them from known, trusted proxy IPs.

Recommended configuration

- `TRUST_PROXY` (boolean): set to `true` when the application is behind trusted reverse proxies that correctly set `X-Forwarded-For`. When `true`, TechHub will parse `X-Forwarded-For` from right-to-left and choose the first public IP that is not in the immediate trusted proxy set.

- `TRUSTED_PROXIES` (optional, suggested): a comma-separated list of CIDRs or IPs that are considered trusted proxies (example: `10.0.0.0/8,203.0.113.5`). When provided, TechHub will only accept `X-Client-Ip` or `X-Forwarded-For` when the immediate remote address matches one of these CIDRs. The implementation uses CIDR matching and `ipaddr.js` for normalization.

Security guidance

- Never trust `X-Client-Ip` or `X-Forwarded-For` coming from arbitrary clients. If `TRUST_PROXY` is not enabled or the remote IP is not in `TRUSTED_PROXIES`, these headers will be ignored.

- If your deployment uses a managed platform (Vercel, Netlify, etc.), follow the provider guidance for trusted proxy addresses and set `TRUST_PROXY` accordingly.

- For multi-tier proxy topologies (CDN + LB + app proxy), prefer providing `TRUSTED_PROXIES` with the immediate proxy IP ranges rather than relying on client-supplied headers.

Implementation notes

- TechHub parses `X-Forwarded-For` right-to-left and will skip any IPs that fall into trusted proxy CIDRs listed in `TRUSTED_PROXIES`. The first remaining public IP (IPv4 or IPv6) is treated as the client IP. If `TRUST_PROXY` is not set or the immediate remote IP is not in `TRUSTED_PROXIES`, proxy headers are ignored.

- The implementation normalizes addresses using `ipaddr.js` and performs CIDR matching for `TRUSTED_PROXIES`.

- Rate limiting and audit logs are based on server-validated client IPs; do not rely on raw header values without a trusted proxy configuration.

Example (env):

```env
TRUST_PROXY=true
TRUSTED_PROXIES=10.0.0.0/8,192.168.0.0/16
```

Testing tips

- To verify header behavior locally, run the app behind a simple proxy (nginx) that forwards `X-Forwarded-For` and set `TRUSTED_PROXIES` to the proxy's address. Confirm the application logs/use the expected client IP rather than the proxy address.

If you'd like, I can add the `TRUSTED_PROXIES` parsing helper and wire it into `src/lib/auth.ts` next.

````

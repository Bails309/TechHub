## Proxy Trust and Header Handling

### Overview

When running TechHub behind a reverse proxy, load balancer, or cloud ingress (e.g., Azure Container Apps Ingress, AWS ALB, Nginx, or Cloudflare), the proxy typically sets headers such as `X-Forwarded-For` or `X-Client-Ip` to surface the original client's IP address. These headers can be spoofed by untrusted clients unless the application only accepts them from known, trusted proxy IPs.

### Recommended Configuration

- `TRUST_PROXY` (boolean): Set to `true` when the application is behind a trusted reverse proxy that correctly sets `X-Forwarded-For`. When `true`, TechHub will parse `X-Forwarded-For` from right-to-left and choose the first public IP that is not in the immediate trusted proxy set.

- `TRUSTED_PROXIES` (optional): A comma-separated list of CIDRs or IPs that are considered trusted proxies (example: `10.0.0.0/8,203.0.113.5`). When provided, TechHub will only accept `X-Client-Ip` or `X-Forwarded-For` when the immediate remote address matches one of these CIDRs.

### Security Guidance

- **Never trust `X-Client-Ip` or `X-Forwarded-For` coming from arbitrary clients.** If `TRUST_PROXY` is not enabled or the remote IP is not in `TRUSTED_PROXIES`, these headers will be ignored.

- **Managed Platforms**: If your deployment uses a managed platform (Azure Container Apps, Vercel, etc.), follow the provider's guidance for trusted proxy addresses and set `TRUST_PROXY` accordingly.

- **Multi-tier Topologies**: For multi-tier proxy topologies (CDN + LB + app proxy), prefer providing `TRUSTED_PROXIES` with the immediate proxy IP ranges rather than relying on client-supplied headers.

### Implementation Notes

- TechHub parses `X-Forwarded-For` right-to-left and will skip any IPs that fall into trusted proxy CIDRs listed in `TRUSTED_PROXIES`. The first remaining public IP (IPv4 or IPv6) is treated as the client IP.

- The implementation normalizes addresses using `ipaddr.js` and performs CIDR matching for `TRUSTED_PROXIES`.

- **Rate Limiting and Audit Logs**: Both are based on server-validated client IPs; do not rely on raw header values without a trusted proxy configuration.

### Example (env)

```env
TRUST_PROXY=true
TRUSTED_PROXIES=10.0.0.0/8,192.168.0.0/16
```

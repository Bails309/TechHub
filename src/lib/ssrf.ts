import { lookup } from 'dns/promises';
import ipaddr from 'ipaddr.js';

export function isPublicIp(address: string) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

export async function assertUrlNotPrivate(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Endpoint must be a valid URL');
  }

  // Allow http(s) for storage endpoints (azurite local dev may use http).
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Endpoint must use http or https');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Endpoint must be a public hostname');
  }

  const isIpLiteral = ipaddr.isValid(hostname);
  if (isIpLiteral && !isPublicIp(hostname)) {
    throw new Error('Endpoint must be a public IP address');
  }

  if (!isIpLiteral) {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) throw new Error('Endpoint host could not be resolved');
    const validRecords = records.filter((r) => Boolean(r.address) && (r.family === 4 || r.family === 6));
    if (!validRecords.length) throw new Error('Endpoint host resolved to no valid IPs');
    for (const rec of validRecords) {
      if (!isPublicIp(String(rec.address))) throw new Error('Endpoint must be a public hostname');
    }
  }
}

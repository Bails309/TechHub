import http from 'http';
import https from 'https';
import ipaddr from 'ipaddr.js';
import { createDefaultHttpClient, createHttpHeaders } from '@azure/core-rest-pipeline';

export type PinnedEndpoint = {
    url: URL;
    hostname: string;
    address: string;
    family: 4 | 6;
};

export function createPinnedAgents(address: string, family: 4 | 6) {
    const lookupFn = (
        hostname: string,
        options: any,
        callback?: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
    ) => {
        const cb = typeof options === 'function' ? options : callback;
        if (!cb) return;
        cb(null, address, family);
    };
    return {
        httpAgent: new http.Agent({ lookup: lookupFn }),
        httpsAgent: new https.Agent({ lookup: lookupFn })
    };
}



export function createPinnedHttpClient(address: string, family: 4 | 6): any {
    const { httpAgent, httpsAgent } = createPinnedAgents(address, family);

    return {
        sendRequest: async (request: any) => {
            return await new Promise((resolve, reject) => {
                try {
                    const isHttps = String(request.url).startsWith('https:');
                    const url = new URL(request.url);
                    const client = isHttps ? https : http;

                    const headers: Record<string, string> = {};
                    const rh = request.headers;
                    if (rh) {
                        try {
                            // Polyfill request headers for downstream policies that might be brittle
                            const originalReqToJSON = (rh as any).toJSON;
                            if (typeof originalReqToJSON === 'function' && !(rh as any).toJson) {
                                (rh as any).toJson = originalReqToJSON.bind(rh);
                            } else if (typeof (rh as any).toJson === 'function' && !(rh as any).toJSON) {
                                (rh as any).toJSON = (rh as any).toJson.bind(rh);
                            }

                            // Safely extract regardless of whether rh is HttpHeaders, Headers, or plain object
                            if (typeof (rh as any).forEach === 'function') {
                                (rh as any).forEach((v: any, k: any) => { headers[k.toLowerCase()] = v; });
                            } else if (typeof (rh as any)[Symbol.iterator] === 'function') {
                                for (const [k, v] of (rh as any)) { headers[k.toLowerCase()] = v; }
                            } else if (typeof (rh as any).toJSON === 'function') {
                                const json = (rh as any).toJSON();
                                for (const k in json) { headers[k.toLowerCase()] = json[k]; }
                            } else if (typeof (rh as any).toJson === 'function') {
                                const json = (rh as any).toJson();
                                for (const k in json) { headers[k.toLowerCase()] = json[k]; }
                            } else {
                                for (const k in rh) {
                                    const v = (rh as any)[k];
                                    if (typeof v === 'string') headers[k.toLowerCase()] = v;
                                }
                            }
                        } catch (e) {
                            console.error('[PINNED-CLIENT] Header extraction failure', e);
                        }
                    }

                    // Host header MUST be the original hostname for the request to be valid at the destination
                    if (url.hostname) {
                        headers['host'] = url.hostname;
                    }

                    const options: any = {
                        method: request.method,
                        hostname: address,
                        port: url.port || (isHttps ? 443 : 80),
                        path: url.pathname + url.search,
                        headers,
                        family,
                        agent: isHttps ? httpsAgent : httpAgent
                    };

                    if (isHttps) {
                        options.servername = url.hostname;
                    }

                    const req = client.request(options, (res) => {
                        const chunks: Buffer[] = [];
                        res.on('data', (chunk) => chunks.push(chunk));
                        res.on('end', () => {
                            // Use a custom Headers implementation to avoid any identity or proxy issues
                            // with the SDK's internal createHttpHeaders factory in varied environments.
                            class SimpleHeaders {
                                private _headers = new Map<string, string>();
                                constructor(raw: any) {
                                    for (const [k, v] of Object.entries(raw)) {
                                        if (v) this._headers.set(k.toLowerCase(), Array.isArray(v) ? v.join(',') : String(v));
                                    }
                                }
                                set(name: string, value: string) { this._headers.set(name.toLowerCase(), value); }
                                get(name: string) { return this._headers.get(name.toLowerCase()); }
                                has(name: string) { return this._headers.has(name.toLowerCase()); }
                                delete(name: string) { this._headers.delete(name.toLowerCase()); }
                                forEach(cb: any) { this._headers.forEach((v, k) => cb(v, k)); }
                                toJSON() {
                                    const obj: any = {};
                                    this._headers.forEach((v, k) => { obj[k] = v; });
                                    return obj;
                                }
                                toJson() { return this.toJSON(); }
                                [Symbol.iterator]() { return this._headers.entries(); }
                            }

                            const responseHeaders = new SimpleHeaders(res.headers);
                            const bodyBuffer = Buffer.concat(chunks);
                            const status = res.statusCode || 0;

                            if (status < 200 || status >= 300) {
                                console.warn(`[AZURE-REST-DEBUG] ${request.method} ${request.url} -> ${status}`, responseHeaders.toJSON());
                            }

                            const pipelineResponse = {
                                request,
                                statusCode: status,
                                status: status, // some SDK versions use status
                                headers: responseHeaders as any,
                                blobBody: Promise.resolve(bodyBuffer),
                                readableStreamBody: require('stream').Readable.from(bodyBuffer),
                                bodyAsText: bodyBuffer.length === 0 ? '' : undefined
                            };

                            // Log final object properties to verify they exist before resolving
                            if (process.env.NODE_ENV !== 'production' || status >= 400) {
                                console.log('[PINNED-CLIENT-DEBUG]', {
                                    status: pipelineResponse.status,
                                    statusCode: pipelineResponse.statusCode,
                                    headersType: typeof pipelineResponse.headers,
                                    hasToJson: typeof (pipelineResponse.headers as any).toJson,
                                    requestId: responseHeaders.get('x-ms-request-id')
                                });
                            }

                            resolve(pipelineResponse);
                        });
                    });

                    req.on('error', (err) => reject(err));

                    if (request.body) {
                        if (Buffer.isBuffer(request.body) || typeof request.body === 'string') {
                            req.end(request.body);
                        } else if (typeof (request.body as any).pipe === 'function') {
                            (request.body as any).pipe(req);
                        } else {
                            req.end();
                        }
                    } else {
                        req.end();
                    }
                } catch (err) {
                    reject(err);
                }
            });
        }
    };
}

/**
 * Minimal request handler compatible with AWS SDK v3 expected shape.
 * We only implement what's necessary for common S3 commands (no body streaming).
 */
export function createPinnedAwsRequestHandler(address: string, family: 4 | 6) {
    const { httpAgent, httpsAgent } = createPinnedAgents(address, family);

    return {
        handle: async (req: any) => {
            return await new Promise((resolve, reject) => {
                try {
                    const isHttps = (req.protocol || 'https:').startsWith('https');
                    const client = isHttps ? https : http;
                    const defaultPort = isHttps ? 443 : 80;
                    const opts: any = {
                        protocol: isHttps ? 'https:' : 'http:',
                        hostname: address,
                        port: req.port || defaultPort,
                        method: req.method || 'GET',
                        path: `${req.path || '/'}${req.query ? '?' + req.query : ''}`,
                        headers: { ...(req.headers || {}), host: req.headers?.Host ?? req.headers?.host ?? req.hostname }
                    };
                    if (isHttps) opts.servername = req.hostname || req.headers?.host;
                    opts.agent = isHttps ? httpsAgent : httpAgent;

                    const r = client.request(opts, (res) => {
                        const headers: Record<string, string> = {};
                        for (const [k, v] of Object.entries(res.headers || {})) {
                            if (Array.isArray(v)) headers[k] = v.join(',');
                            else if (typeof v === 'string') headers[k] = v;
                        }
                        res.on('data', () => { });
                        res.on('end', () => {
                            resolve({ response: { statusCode: res.statusCode || 0, headers } });
                        });
                    });
                    r.on('error', (err) => reject(err));
                    r.setTimeout(5000, () => r.destroy(new Error('Request timed out')));
                    r.end();
                } catch (err) {
                    reject(err);
                }
            });
        }
    } as any;
}

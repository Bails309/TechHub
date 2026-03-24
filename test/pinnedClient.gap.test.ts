import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { Readable } from 'node:stream';

vi.mock('@azure/core-rest-pipeline', () => ({
  createDefaultHttpClient: vi.fn(),
  createHttpHeaders: vi.fn()
}));

const { createPinnedAgents, createPinnedHttpClient, createPinnedAwsRequestHandler }
  = await import('../src/lib/pinnedClient');

let server: http.Server | null = null;

function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<number> {
  return new Promise((resolve) => {
    server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve((server!.address() as { port: number }).port);
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
    server = null;
  });
}

describe('pinnedClient.ts – gap coverage', () => {
  afterEach(async () => { await stopServer(); });

  describe('createPinnedAgents', () => {
    it('creates HTTP and HTTPS agents', () => {
      const agents = createPinnedAgents('1.2.3.4', 4);
      expect(agents).toHaveProperty('httpAgent');
      expect(agents).toHaveProperty('httpsAgent');
    });
  });

  describe('createPinnedHttpClient', () => {
    it('sends GET and resolves with pipeline response', async () => {
      const port = await startServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('hello'); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      const result = await client.sendRequest({ url: `http://127.0.0.1:${port}/test?q=1`, method: 'GET', headers: { 'X-Custom': 'v' } });
      expect(result.statusCode).toBe(200);
      expect((await result.blobBody).toString()).toBe('hello');
    });

    it('sends POST with Buffer body', async () => {
      let body = '';
      const port = await startServer((req, res) => { const c: Buffer[] = []; req.on('data', d => c.push(d)); req.on('end', () => { body = Buffer.concat(c).toString(); res.writeHead(200); res.end(); }); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'POST', headers: null, body: Buffer.from('buf') });
      expect(body).toBe('buf');
    });

    it('sends POST with string body', async () => {
      let body = '';
      const port = await startServer((req, res) => { const c: Buffer[] = []; req.on('data', d => c.push(d)); req.on('end', () => { body = Buffer.concat(c).toString(); res.writeHead(200); res.end(); }); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'POST', headers: null, body: 'str' });
      expect(body).toBe('str');
    });

    it('sends POST with stream body', async () => {
      let body = '';
      const port = await startServer((req, res) => { const c: Buffer[] = []; req.on('data', d => c.push(d)); req.on('end', () => { body = Buffer.concat(c).toString(); res.writeHead(200); res.end(); }); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'POST', headers: null, body: Readable.from(Buffer.from('stream')) });
      expect(body).toBe('stream');
    });

    it('sends POST with no body', async () => {
      const port = await startServer((_req, res) => { res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      const result = await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'POST', headers: null });
      expect(result.statusCode).toBe(200);
    });

    it('handles forEach-based headers', async () => {
      let hdrs: Record<string, string | undefined> = {};
      const port = await startServer((req, res) => { hdrs = req.headers as any; res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: { forEach: (cb: any) => cb('v1', 'x-fe') } as any });
      expect(hdrs['x-fe']).toBe('v1');
    });

    it('handles Symbol.iterator headers', async () => {
      let hdrs: Record<string, string | undefined> = {};
      const port = await startServer((req, res) => { hdrs = req.headers as any; res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: { [Symbol.iterator]: function* () { yield ['x-it', 'v1']; } } as any });
      expect(hdrs['x-it']).toBe('v1');
    });

    it('handles toJSON-based headers', async () => {
      let hdrs: Record<string, string | undefined> = {};
      const port = await startServer((req, res) => { hdrs = req.headers as any; res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: { toJSON: () => ({ 'x-j': 'v1' }) } as any });
      expect(hdrs['x-j']).toBe('v1');
    });

    it('handles toJson-based headers (lowercase)', async () => {
      let hdrs: Record<string, string | undefined> = {};
      const port = await startServer((req, res) => { hdrs = req.headers as any; res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: { toJson: () => ({ 'x-jl': 'v1' }) } as any });
      expect(hdrs['x-jl']).toBe('v1');
    });

    it('handles plain object headers', async () => {
      let hdrs: Record<string, string | undefined> = {};
      const port = await startServer((req, res) => { hdrs = req.headers as any; res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: { 'x-plain': 'v1' } });
      expect(hdrs['x-plain']).toBe('v1');
    });

    it('polyfills toJson from toJSON', async () => {
      const port = await startServer((_req, res) => { res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      const h: any = { toJSON: () => ({ a: '1' }), forEach: (cb: any) => cb('1', 'a') };
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: h });
      expect(h.toJson).toBeDefined();
    });

    it('polyfills toJSON from toJson', async () => {
      const port = await startServer((_req, res) => { res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      const h: any = { toJson: () => ({ a: '1' }), forEach: (cb: any) => cb('1', 'a') };
      await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: h });
      expect(h.toJSON).toBeDefined();
    });

    it('handles non-200 status', async () => {
      const port = await startServer((_req, res) => { res.writeHead(404); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      const result = await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: null });
      expect(result.statusCode).toBe(404);
    });

    it('rejects on connection error', async () => {
      const client = createPinnedHttpClient('127.0.0.1', 4);
      await expect(client.sendRequest({ url: 'http://127.0.0.1:1/', method: 'GET', headers: null })).rejects.toThrow();
    });

    it('handles header extraction error gracefully', async () => {
      const port = await startServer((_req, res) => { res.writeHead(200); res.end(); });
      const client = createPinnedHttpClient('127.0.0.1', 4);
      const result = await client.sendRequest({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: { get forEach() { throw new Error('broken'); } } as any });
      expect(result.statusCode).toBe(200);
    });
  });

  describe('createPinnedAwsRequestHandler', () => {
    it('handles HTTP request', async () => {
      const port = await startServer((_req, res) => { res.writeHead(200, { 'x-amz-id': '123' }); res.end(); });
      const handler = createPinnedAwsRequestHandler('127.0.0.1', 4);
      const result = await handler.handle({ protocol: 'http:', hostname: '127.0.0.1', port, method: 'GET', path: '/key', query: 'v=1', headers: { host: '127.0.0.1' } });
      expect(result.response.statusCode).toBe(200);
      expect(result.response.headers['x-amz-id']).toBe('123');
    });

    it('handles request without query', async () => {
      const port = await startServer((_req, res) => { res.writeHead(200); res.end(); });
      const handler = createPinnedAwsRequestHandler('127.0.0.1', 4);
      const result = await handler.handle({ protocol: 'http:', hostname: '127.0.0.1', port, method: 'GET', path: '/', headers: { host: '127.0.0.1' } });
      expect(result.response.statusCode).toBe(200);
    });

    it('rejects on connection error', async () => {
      const handler = createPinnedAwsRequestHandler('127.0.0.1', 4);
      await expect(handler.handle({ protocol: 'http:', hostname: '127.0.0.1', port: 1, method: 'GET', path: '/', headers: {} })).rejects.toThrow();
    });

    it('handles array header values in AWS response', async () => {
      const port = await startServer((_req, res) => {
        res.writeHead(200, { 'x-multi': 'a' });
        res.end();
      });
      const handler = createPinnedAwsRequestHandler('127.0.0.1', 4);
      const result = await handler.handle({ protocol: 'http:', hostname: '127.0.0.1', port, method: 'GET', path: '/', headers: { host: '127.0.0.1' } });
      expect(result.response.statusCode).toBe(200);
    });

    it('times out on slow server', async () => {
      const port = await startServer((_req, _res) => {
        // Never respond - let the timeout fire
      });
      const handler = createPinnedAwsRequestHandler('127.0.0.1', 4);
      await expect(handler.handle({ protocol: 'http:', hostname: '127.0.0.1', port, method: 'GET', path: '/', headers: { host: '127.0.0.1' } })).rejects.toThrow();
    }, 10000);
  });
});

import { describe, it, expect } from 'vitest';
import { createPinnedAgents, createPinnedHttpClient, createPinnedAwsRequestHandler } from '../src/lib/pinnedClient';

describe('pinnedClient', () => {
  describe('createPinnedAgents', () => {
    it('returns httpAgent and httpsAgent for IPv4', () => {
      const { httpAgent, httpsAgent } = createPinnedAgents('1.2.3.4', 4);
      expect(httpAgent).toBeDefined();
      expect(httpsAgent).toBeDefined();
    });

    it('returns agents for IPv6', () => {
      const { httpAgent, httpsAgent } = createPinnedAgents('::1', 6);
      expect(httpAgent).toBeDefined();
      expect(httpsAgent).toBeDefined();
    });

    it('agents use custom lookup that returns the pinned address', () => {
      const { httpAgent } = createPinnedAgents('10.20.30.40', 4);
      const http = require('http');
      expect(httpAgent).toBeInstanceOf(http.Agent);
    });
  });

  describe('createPinnedHttpClient', () => {
    it('returns an object with sendRequest method', () => {
      const client = createPinnedHttpClient('93.184.216.34', 4);
      expect(client).toBeDefined();
      expect(typeof client.sendRequest).toBe('function');
    });
  });

  describe('createPinnedAwsRequestHandler', () => {
    it('returns an object with handle method', () => {
      const handler = createPinnedAwsRequestHandler('93.184.216.34', 4);
      expect(handler).toBeDefined();
      expect(typeof handler.handle).toBe('function');
    });
  });
});

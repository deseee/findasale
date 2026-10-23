/**
 * FindA.Sale MCP Server
 *
 * Public, read-only, unauthenticated MCP server for sale and item discovery.
 *
 * Endpoints:
 * - POST /mcp                         Streamable HTTP (MCP 2026-07-28, stateless; 2025 clients served statelessly too)
 * - GET  /sse + POST /messages?sessionId=…   Legacy HTTP+SSE transport (deprecated; kept for existing clients)
 * - POST /messages (no sessionId)     Sessionless JSON-RPC shim (initialize, tools/list, tools/call, ping) kept from v1
 * - GET  /mcp/server-card             MCP Server Card (application/mcp-server-card+json)
 * - GET  /.well-known/ai-catalog.json AI Catalog linking the Server Card
 * - GET  /.well-known/mcp.json        Informal manifest
 * - GET  /health                      Health check (Railway)
 */

import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { SSEServerTransport } from '@modelcontextprotocol/server-legacy/sse';

import { createFindASaleServer, parseShimArgs, runTool, SERVER_NAME, SERVER_VERSION, SERVER_INSTRUCTIONS, SERVER_TITLE, toolListForShim } from './server';
import { TOOLS } from './tools';
import { rateLimiter } from './lib/rateLimiter';
import { requestContext, RequestContext } from './lib/requestContext';
import { aiCatalog, mcpManifest, serverCard } from './lib/discovery';
import { cacheSize } from './lib/cache';

const PORT = parseInt(process.env.PORT || '3003', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

const MAX_SSE_SESSIONS = 300;
const MAX_SSE_SESSIONS_PER_IP = 10;
const SSE_KEEPALIVE_MS = 25_000;
const SSE_MAX_SESSION_MS = 60 * 60 * 1000;

const app = express();
// Railway terminates TLS at one proxy hop; trust it so req.ip is the real client.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version', 'Retry-After'],
    maxAge: 86400,
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path !== '/health') console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ip=${req.ip}`);
  next();
});

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Per-IP request budget for every MCP endpoint. */
function httpRateLimit(req: Request, res: Response, next: NextFunction): void {
  const retryAfter = rateLimiter.checkHttp(clientIp(req));
  if (retryAfter === null) return next();
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: `Too many requests. Try again in ${retryAfter} seconds.` },
    id: null,
  });
}

function withContext(req: Request, transport: RequestContext['transport'], fn: () => Promise<void>): Promise<void> {
  return requestContext.run({ clientIp: clientIp(req), transport }, fn);
}

const jsonBody = express.json({ limit: '256kb' });

// ──────────────────────────────────────────────────────────────
// Health and discovery
// ──────────────────────────────────────────────────────────────

let activeSseSessions = 0;

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: SERVER_VERSION,
    uptime: process.uptime(),
    tools: TOOLS.length,
    sseSessions: activeSseSessions,
    cacheEntries: cacheSize(),
    environment: NODE_ENV,
  });
});

function sendDiscovery(res: Response, body: unknown, contentType = 'application/json'): void {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.type(contentType).send(JSON.stringify(body, null, 2));
}

app.get(['/mcp/server-card', '/.well-known/mcp/server-card.json'], httpRateLimit, (_req, res) =>
  sendDiscovery(res, serverCard(), 'application/mcp-server-card+json')
);
app.get('/.well-known/ai-catalog.json', httpRateLimit, (_req, res) => sendDiscovery(res, aiCatalog(), 'application/ai-catalog+json'));
app.get('/.well-known/mcp.json', httpRateLimit, (_req, res) => sendDiscovery(res, mcpManifest()));

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: SERVER_TITLE,
    registryName: SERVER_NAME,
    version: SERVER_VERSION,
    mcp: { streamableHttp: '/mcp', sse: '/sse' },
    serverCard: '/mcp/server-card',
    docs: 'https://finda.sale/llms.txt',
  });
});

// ──────────────────────────────────────────────────────────────
// Streamable HTTP (/mcp), stateless
// ──────────────────────────────────────────────────────────────

const mcpHandler = createMcpHandler(() => createFindASaleServer(), {
  onerror: (err) => console.error('[MCP] handler error:', err.message),
});
const mcpNodeHandler = toNodeHandler(mcpHandler);

app.all('/mcp', httpRateLimit, jsonBody, async (req: Request, res: Response) => {
  await withContext(req, 'streamable-http', async () => {
    try {
      await mcpNodeHandler(req, res, req.body);
    } catch (err: any) {
      console.error('[MCP] /mcp failed:', err?.message ?? err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────
// Legacy HTTP+SSE (/sse + /messages?sessionId=…)
// ──────────────────────────────────────────────────────────────

const sseSessions = new Map<string, { transport: SSEServerTransport; ip: string }>();
const sseCountByIp = new Map<string, number>();

app.get('/sse', httpRateLimit, async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (activeSseSessions >= MAX_SSE_SESSIONS || (sseCountByIp.get(ip) ?? 0) >= MAX_SSE_SESSIONS_PER_IP) {
    res.setHeader('Retry-After', '30');
    res.status(429).json({ error: 'Too many open SSE sessions. Use the Streamable HTTP endpoint at /mcp.' });
    return;
  }

  const transport = new SSEServerTransport('/messages', res);
  const server = createFindASaleServer();
  const sessionId = transport.sessionId;
  sseSessions.set(sessionId, { transport, ip });
  sseCountByIp.set(ip, (sseCountByIp.get(ip) ?? 0) + 1);
  activeSseSessions++;

  // Comment frames keep proxies from closing an idle stream.
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n');
  }, SSE_KEEPALIVE_MS);
  const maxAge = setTimeout(() => void transport.close(), SSE_MAX_SESSION_MS);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(keepAlive);
    clearTimeout(maxAge);
    sseSessions.delete(sessionId);
    const n = (sseCountByIp.get(ip) ?? 1) - 1;
    if (n <= 0) sseCountByIp.delete(ip);
    else sseCountByIp.set(ip, n);
    activeSseSessions = Math.max(0, activeSseSessions - 1);
    void server.close().catch(() => undefined);
  };
  transport.onclose = cleanup;
  res.on('close', cleanup);

  try {
    await server.connect(transport);
  } catch (err: any) {
    console.error('[SSE] connect failed:', err?.message ?? err);
    cleanup();
    if (!res.headersSent) res.status(500).end();
  }
});

app.post('/messages', httpRateLimit, jsonBody, async (req: Request, res: Response) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;

  if (sessionId) {
    const session = sseSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unknown or expired session. Reconnect to /sse.' }, id: null });
      return;
    }
    await withContext(req, 'sse', () => session.transport.handlePostMessage(req, res, req.body));
    return;
  }

  await withContext(req, 'json-rpc', () => handleShim(req, res));
});

// ──────────────────────────────────────────────────────────────
// Sessionless JSON-RPC shim (v1 behavior of POST /messages)
// ──────────────────────────────────────────────────────────────

async function handleShim(req: Request, res: Response): Promise<void> {
  const message = req.body ?? {};
  const id = message.id ?? null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id });
    return;
  }

  switch (message.method) {
    case 'initialize':
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, title: SERVER_TITLE, version: SERVER_VERSION },
          instructions: SERVER_INSTRUCTIONS,
        },
      });
      return;
    case 'ping':
      res.json({ jsonrpc: '2.0', id, result: {} });
      return;
    case 'tools/list':
      res.json({ jsonrpc: '2.0', id, result: { tools: toolListForShim() } });
      return;
    case 'tools/call': {
      const name = message.params?.name;
      const spec = TOOLS.find((t) => t.name === name);
      if (!spec) {
        res.status(400).json({ jsonrpc: '2.0', error: { code: -32602, message: `Unknown tool: ${String(name)}` }, id });
        return;
      }
      const parsed = parseShimArgs(spec, message.params?.arguments);
      if (!parsed.ok) {
        res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: parsed.message }], isError: true } });
        return;
      }
      const result = await runTool(spec, parsed.value);
      res.json({ jsonrpc: '2.0', id, result });
      return;
    }
    default:
      if (id === null) {
        res.status(202).end(); // notification
        return;
      }
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id });
  }
}

// ──────────────────────────────────────────────────────────────
// Fallbacks
// ──────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found', mcp: '/mcp', sse: '/sse', serverCard: '/mcp/server-card' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Request too large' }, id: null });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
    return;
  }
  console.error('[Error]', err?.message ?? err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const httpServer = app.listen(PORT, () => {
  console.log(`FindA.Sale MCP Server ${SERVER_VERSION} listening on :${PORT} (${NODE_ENV}) with ${TOOLS.length} tools`);
  console.log('  POST /mcp (Streamable HTTP) | GET /sse + POST /messages (legacy SSE) | GET /mcp/server-card');
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down...`);
  for (const { transport } of sseSessions.values()) void transport.close().catch(() => undefined);
  void mcpHandler.close().catch(() => undefined);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

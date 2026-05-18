/**
 * FindA.Sale MCP Server — Phase 1 MVP
 *
 * Express HTTP server with MCP SSE transport.
 * Exposes 10 tools for AI agents to search sales and items.
 *
 * Endpoints:
 * - GET  /health        → Server health check
 * - GET  /sse           → MCP SSE connection
 * - POST /messages      → MCP tool call handler
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { rateLimiter } from './lib/rateLimiter';

import { searchSalesTool } from './tools/searchSales';
import { getSaleTool } from './tools/getSale';
import { searchItemsTool } from './tools/searchItems';
import { getItemTool } from './tools/getItem';
import { listCitiesTool } from './tools/listCities';
import { listSaleTypesTool } from './tools/listSaleTypes';
import { listCategoriesTool } from './tools/listCategories';
import { getTrendingSalesTool } from './tools/getTrendingSales';
import { getSalesStartingSoonTool } from './tools/getSalesStartingSoon';
import { findItemForSaleTool } from './tools/findItemForSale';

import {
  handleSearchSales,
  handleGetSale,
  handleSearchItems,
  handleGetItem,
  handleListCities,
  handleListSaleTypes,
  handleListCategories,
  handleGetTrendingSales,
  handleGetSalesStartingSoon,
  handleFindItemForSale,
} from './handlers';
import { MCPToolDefinition } from './types';

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3003', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// Tool registry
const TOOLS: Record<string, { definition: MCPToolDefinition; handler: Function }> = {
  search_sales: { definition: searchSalesTool, handler: handleSearchSales },
  get_sale: { definition: getSaleTool, handler: handleGetSale },
  search_items: { definition: searchItemsTool, handler: handleSearchItems },
  get_item: { definition: getItemTool, handler: handleGetItem },
  list_cities: { definition: listCitiesTool, handler: handleListCities },
  list_sale_types: { definition: listSaleTypesTool, handler: handleListSaleTypes },
  list_categories: { definition: listCategoriesTool, handler: handleListCategories },
  get_trending_sales: { definition: getTrendingSalesTool, handler: handleGetTrendingSales },
  get_sales_starting_soon: { definition: getSalesStartingSoonTool, handler: handleGetSalesStartingSoon },
  find_item_for_sale: { definition: findItemForSaleTool, handler: handleFindItemForSale },
};

// ──────────────────────────────────────────────────────────────
// Express Setup
// ──────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ──────────────────────────────────────────────────────────────
// Health Check
// ──────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    tools: Object.keys(TOOLS).length,
    environment: NODE_ENV,
  });
});

// ──────────────────────────────────────────────────────────────
// MCP SSE Transport
// ──────────────────────────────────────────────────────────────

interface MCPMessage {
  jsonrpc: string;
  method?: string;
  params?: any;
  id?: string | number;
}

interface SSEConnection {
  res: Response;
  requestId: number;
}

const sseConnections = new Map<string, SSEConnection>();
let connectionCounter = 0;

/**
 * GET /sse — MCP SSE Connection Handler
 * Client opens a persistent SSE connection to receive messages
 */
app.get('/sse', (req: Request, res: Response) => {
  const clientId = `client-${Date.now()}-${Math.random()}`;
  const requestId = ++connectionCounter;

  console.log(`[SSE] Client ${clientId} connected (request ${requestId})`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Store connection
  sseConnections.set(clientId, { res, requestId });

  // Send init message
  res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'initialize' })}\n\n`);

  // Cleanup on disconnect
  req.on('close', () => {
    console.log(`[SSE] Client ${clientId} disconnected`);
    sseConnections.delete(clientId);
    res.end();
  });

  req.on('error', (err) => {
    console.error(`[SSE] Client ${clientId} error:`, err.message);
    sseConnections.delete(clientId);
  });
});

/**
 * POST /messages — MCP Tool Call Handler
 * Client sends tool invocation request; we process and broadcast response
 */
app.post('/messages', async (req: Request, res: Response) => {
  try {
    const message: MCPMessage = req.body;
    const clientIp = req.ip || '0.0.0.0';

    // Validate request
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: message.id,
      });
    }

    // Handle tool call
    if (message.method === 'tools/call') {
      const { name, arguments: toolArgs } = message.params || {};
      const id = message.id;

      if (!name) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Missing tool name' },
          id,
        });
      }

      // Rate limit check
      if (!rateLimiter.isAllowed(clientIp, name)) {
        const resetTime = rateLimiter.getResetTime(clientIp, name);
        return res.status(429).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: `Rate limit exceeded for ${name}. Reset in ${Math.ceil(resetTime / 1000)}s`,
          },
          id,
          headers: { 'Retry-After': Math.ceil(resetTime / 1000) },
        });
      }

      // Execute tool
      const tool = TOOLS[name];
      if (!tool) {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: `Tool not found: ${name}` },
          id,
        });
      }

      try {
        console.log(`[Tool] Executing ${name} with args:`, toolArgs);
        const result = await tool.handler(toolArgs || {});

        console.log(`[Tool] ${name} succeeded`);

        // Send result to client via SSE
        const response = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          },
        };

        // Broadcast to all connected SSE clients
        sseConnections.forEach(({ res: sseRes }) => {
          sseRes.write(`data: ${JSON.stringify(response)}\n\n`);
        });

        // Also return directly
        return res.json(response);
      } catch (error: any) {
        console.error(`[Tool] ${name} failed:`, error.message);

        const response = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32001,
            message: error.message || 'Tool execution failed',
          },
        };

        // Broadcast error to all connected SSE clients
        sseConnections.forEach(({ res: sseRes }) => {
          sseRes.write(`data: ${JSON.stringify(response)}\n\n`);
        });

        return res.status(400).json(response);
      }
    }

    // Handle list tools request
    if (message.method === 'tools/list') {
      const toolDefinitions = Object.values(TOOLS).map((t) => t.definition);
      return res.json({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: toolDefinitions,
        },
      });
    }

    // Unknown method
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32601, message: 'Method not found' },
      id: message.id,
    });
  } catch (err: any) {
    console.error('[Server] Error processing message:', err);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
    });
  }
});

// ──────────────────────────────────────────────────────────────
// Error Handling
// ──────────────────────────────────────────────────────────────

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'An error occurred',
  });
});

// ──────────────────────────────────────────────────────────────
// Startup
// ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                 FindA.Sale MCP Server v1.0.0                  ║
╠════════════════════════════════════════════════════════════════╣
║  Status:     Running                                           ║
║  Port:       ${PORT}                                              ║
║  Environment: ${NODE_ENV}                                         ║
║  Tools:      ${Object.keys(TOOLS).length}                                              ║
║                                                                ║
║  Endpoints:                                                    ║
║  - GET  /health       → Server health                         ║
║  - GET  /sse          → MCP SSE connection                    ║
║  - POST /messages     → Tool invocation                       ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

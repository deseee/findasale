/**
 * MCP Server local types.
 *
 * Kept local (no @findasale/shared import) because the MCP server builds on its
 * own in Railway from packages/mcp-server. Public response shapes live in
 * lib/publicShape.ts and handlers.ts.
 */

export interface RateLimitStore {
  [key: string]: {
    [bucket: string]: {
      count: number;
      resetAt: number;
    };
  };
}

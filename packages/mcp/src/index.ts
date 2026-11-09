/**
 * FOSAY MCP server (stdio). Exposes the agent's FOSAY wallet as tools to any
 * MCP-capable agent. Config comes from the environment (see .env.example); the agent
 * key is loaded locally and never sent to the client.
 *
 * stdout carries the MCP protocol: log to stderr only.
 */
import { loadAgentRuntime } from '@fosay/agent';
import { decodeError } from '@fosay/sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export const SERVER_NAME = 'fosay';
export const SERVER_VERSION = '0.1.0';

async function main(): Promise<void> {
  const { agent } = loadAgentRuntime(process.env as Record<string, string | undefined>);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const { registerFosayTools } = await import('./tools');
  registerFosayTools(server, agent);
  await server.connect(new StdioServerTransport());
  console.error(`fosay-mcp ready for wallet ${agent.identity.wallet}`);
}

main().catch((e: unknown) => {
  const fe = decodeError(e);
  console.error(`fosay-mcp failed to start (${fe.code}): ${fe.message}`);
  process.exitCode = 1;
});

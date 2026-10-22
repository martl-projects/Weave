import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Backend } from '@weave/node';
import { createWeaveMcp, type WeaveMcpOptions } from './server.ts';

export { agentView, createWeaveMcp, type InboxItem, type WeaveMcpOptions } from './server.ts';

/** Serve Weave over MCP on stdin/stdout until the client disconnects. Nothing else may write to stdout. */
export async function serveStdio(backend: Backend, options: WeaveMcpOptions = {}): Promise<void> {
  const { server, close } = createWeaveMcp(backend, options);
  const transport = new StdioServerTransport();
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
    void server.connect(transport);
  });
  close();
}

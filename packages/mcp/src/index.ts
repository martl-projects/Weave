import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Backend } from '@weave/node';
import { createWeaveMcp, sessionFromEnv, type WeaveMcpOptions } from './server.ts';

export { agentView, createWeaveMcp, sessionFromEnv, type InboxItem, type WeaveMcpOptions } from './server.ts';

/** Serve Weave over MCP on stdin/stdout until the client disconnects. Nothing else may write to stdout. */
export async function serveStdio(backend: Backend, options: WeaveMcpOptions = {}): Promise<void> {
  // Over stdio the harness started us, and may have said for which session.
  const session = options.session ?? sessionFromEnv();
  const { server, close } = createWeaveMcp(backend, { ...options, ...(session ? { session } : {}) });
  const transport = new StdioServerTransport();
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
    void server.connect(transport);
  });
  close();
}

/**
 * Smart Agent Workflow MCP Server
 *
 * The only MCP that enforces tests before merge.
 * Full-cycle development automation with testing gates and knowledge graph memory.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  createWorktree,
  createWorktreeDefinition,
  worktreeStatus,
  worktreeStatusDefinition,
  cleanupWorktree,
  cleanupWorktreeDefinition,
  abortWorktree,
  abortWorktreeDefinition,
} from './tools/worktree/index.js';

import {
  worktreeStatusResource,
  getWorktreeStatusResource,
} from './resources/index.js';

const server = new Server(
  {
    name: 'smart-agent-workflow-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      createWorktreeDefinition,
      worktreeStatusDefinition,
      cleanupWorktreeDefinition,
      abortWorktreeDefinition,
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'create_worktree': {
        const result = await createWorktree({
          task: args?.task as string,
          base_branch: (args?.base_branch as string) || 'main',
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'worktree_status': {
        const result = await worktreeStatus({});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cleanup_worktree': {
        const result = await cleanupWorktree({
          worktree_path: args?.worktree_path as string,
          force: (args?.force as boolean) || false,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'abort_worktree': {
        const result = await abortWorktree({
          worktree_path: args?.worktree_path as string,
          reason: args?.reason as string | undefined,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [worktreeStatusResource],
  };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'worktree://status') {
    const content = await getWorktreeStatusResource();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: content,
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

export async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (not stdout, which is used for MCP communication)
  console.error('Smart Agent Workflow MCP server running on stdio');
}

export { server };

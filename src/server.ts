/**
 * Smart Agent Workflow MCP Server
 *
 * The only MCP that enforces tests before merge.
 * Full-cycle development automation with testing gates and knowledge graph memory.
 *
 * CRITICAL RULES (Enforced by this MCP):
 * 1. Tests MUST pass before cleanup_worktree
 * 2. Build MUST pass before cleanup_worktree
 * 3. Worktrees MUST be closed after completion
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Worktree tools
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

// Testing tools
import {
  runE2ETests,
  runE2ETestsDefinition,
  verifyBuild,
  verifyBuildDefinition,
  generateTestTemplate,
  generateTestTemplateDefinition,
  getTestResults,
  getTestResultsDefinition,
} from './tools/testing/index.js';

// Workflow tools (v0.3.0)
import {
  startFeature,
  startFeatureDefinition,
  completeFeature,
  completeFeatureDefinition,
  rollbackFeature,
  rollbackFeatureDefinition,
  getWorkflowStatus,
  getWorkflowStatusDefinition,
} from './tools/workflow/index.js';

// Documentation tools (v0.4.0)
import {
  updateDocumentation,
  updateDocumentationDefinition,
  generateCompletionReport,
  generateCompletionReportDefinition,
  syncChangelog,
  syncChangelogDefinition,
} from './tools/documentation/index.js';

// Memory tools (v0.5.0)
import {
  saveContext,
  saveContextDefinition,
  restoreContext,
  restoreContextDefinition,
  getMemory,
  getMemoryDefinition,
} from './tools/memory/index.js';

// Resources
import {
  worktreeStatusResource,
  getWorktreeStatusResource,
  testResultsResource,
  getTestResultsResource,
  workflowCurrentResource,
  getWorkflowCurrentResource,
  projectDocsResource,
  getProjectDocsResource,
  memoryKnowledgeResource,
  getMemoryKnowledgeResource,
} from './resources/index.js';

const server = new Server(
  {
    name: 'smart-agent-workflow-mcp',
    version: '0.5.0',
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
      // Worktree management
      createWorktreeDefinition,
      worktreeStatusDefinition,
      cleanupWorktreeDefinition,
      abortWorktreeDefinition,
      // Testing (v0.2.0)
      runE2ETestsDefinition,
      verifyBuildDefinition,
      generateTestTemplateDefinition,
      getTestResultsDefinition,
      // Workflow orchestration (v0.3.0)
      startFeatureDefinition,
      completeFeatureDefinition,
      rollbackFeatureDefinition,
      getWorkflowStatusDefinition,
      // Documentation (v0.4.0)
      updateDocumentationDefinition,
      generateCompletionReportDefinition,
      syncChangelogDefinition,
      // Memory (v0.5.0)
      saveContextDefinition,
      restoreContextDefinition,
      getMemoryDefinition,
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // === WORKTREE TOOLS ===
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
          commit_message: args?.commit_message as string | undefined,
        });

        // Add reminder about the rules
        const reminder = result.success
          ? '\n\nWorktree closed successfully.'
          : '\n\nREMINDER: Run run_e2e_tests and verify_build before cleanup_worktree.';

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2) + reminder,
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

      // === TESTING TOOLS (v0.2.0) ===
      case 'run_e2e_tests': {
        const result = await runE2ETests({
          worktree_path: args?.worktree_path as string | undefined,
          test_path: args?.test_path as string | undefined,
          retries: args?.retries as number | undefined,
          headed: args?.headed as boolean | undefined,
          project: args?.project as string | undefined,
        });

        const nextStep = result.success
          ? 'Tests PASSED. Next: Run verify_build, then cleanup_worktree.'
          : 'Tests FAILED. Fix the issues and run again.';

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2) + `\n\n${nextStep}`,
            },
          ],
        };
      }

      case 'verify_build': {
        const result = await verifyBuild({
          worktree_path: args?.worktree_path as string | undefined,
          script: args?.script as string | undefined,
          timeout: args?.timeout as number | undefined,
        });

        const nextStep = result.success
          ? 'Build PASSED. Next: Run cleanup_worktree to merge and close.'
          : 'Build FAILED. Fix the errors and run again.';

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2) + `\n\n${nextStep}`,
            },
          ],
        };
      }

      case 'generate_test_template': {
        const result = await generateTestTemplate({
          worktree_path: args?.worktree_path as string | undefined,
          feature_name: args?.feature_name as string,
          type: args?.type as 'frontend' | 'api' | 'both',
          base_url: args?.base_url as string | undefined,
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

      case 'get_test_results': {
        const result = await getTestResults({
          worktree_path: args?.worktree_path as string | undefined,
          include_output: args?.include_output as boolean | undefined,
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

      // === WORKFLOW TOOLS (v0.3.0) ===
      case 'start_feature': {
        const result = await startFeature({
          feature_name: args?.feature_name as string,
          description: args?.description as string,
          type: args?.type as 'feature' | 'bugfix' | 'refactor' | 'docs' | undefined,
          base_branch: args?.base_branch as string | undefined,
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

      case 'complete_feature': {
        const result = await completeFeature({
          worktree_path: args?.worktree_path as string,
          commit_message: args?.commit_message as string | undefined,
          skip_tests: args?.skip_tests as boolean | undefined,
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

      case 'rollback_feature': {
        const result = await rollbackFeature({
          worktree_path: args?.worktree_path as string,
          reason: args?.reason as string,
          keep_branch: args?.keep_branch as boolean | undefined,
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

      case 'get_workflow_status': {
        const result = await getWorkflowStatus({
          include_history: args?.include_history as boolean | undefined,
          limit: args?.limit as number | undefined,
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

      // === DOCUMENTATION TOOLS (v0.4.0) ===
      case 'update_documentation': {
        const result = await updateDocumentation({
          doc_path: args?.doc_path as string | undefined,
          workflow_id: args?.workflow_id as string | undefined,
          section: args?.section as string | undefined,
          content: args?.content as string | undefined,
          mode: args?.mode as 'append' | 'replace' | 'prepend' | undefined,
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

      case 'generate_completion_report': {
        const result = await generateCompletionReport({
          workflow_id: args?.workflow_id as string | undefined,
          output_path: args?.output_path as string | undefined,
          include_tests: args?.include_tests as boolean | undefined,
          include_diff: args?.include_diff as boolean | undefined,
          include_timing: args?.include_timing as boolean | undefined,
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

      case 'sync_changelog': {
        const result = await syncChangelog({
          changelog_path: args?.changelog_path as string | undefined,
          version: args?.version as string | undefined,
          category: args?.category as 'added' | 'changed' | 'fixed' | 'removed' | 'deprecated' | 'security' | undefined,
          entry: args?.entry as string | undefined,
          workflow_id: args?.workflow_id as string | undefined,
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

      // === MEMORY TOOLS (v0.5.0) ===
      case 'save_context': {
        const result = await saveContext({
          workflow_id: args?.workflow_id as string | undefined,
          decisions: args?.decisions as string[] | undefined,
          learnings: args?.learnings as string[] | undefined,
          tags: args?.tags as string[] | undefined,
          notes: args?.notes as string | undefined,
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

      case 'restore_context': {
        const result = await restoreContext({
          workflow_id: args?.workflow_id as string | undefined,
          feature_name: args?.feature_name as string | undefined,
          include_related: args?.include_related as boolean | undefined,
          limit: args?.limit as number | undefined,
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

      case 'get_memory': {
        const result = await getMemory({
          query: args?.query as string | undefined,
          type: args?.type as 'decision' | 'learning' | 'context' | 'file_change' | 'error' | 'success' | undefined,
          tags: args?.tags as string[] | undefined,
          workflow_id: args?.workflow_id as string | undefined,
          file_path: args?.file_path as string | undefined,
          limit: args?.limit as number | undefined,
          min_importance: args?.min_importance as number | undefined,
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
    resources: [
      worktreeStatusResource,
      testResultsResource,
      workflowCurrentResource,
      projectDocsResource,
      memoryKnowledgeResource,
    ],
  };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'worktree://status': {
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

    case 'tests://latest': {
      const content = await getTestResultsResource();
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

    case 'workflow://current': {
      const content = await getWorkflowCurrentResource();
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

    case 'docs://project': {
      const content = await getProjectDocsResource();
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

    case 'memory://knowledge': {
      const content = await getMemoryKnowledgeResource();
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

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

export async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (not stdout, which is used for MCP communication)
  console.error('Smart Agent Workflow MCP v0.5.0 running on stdio');
  console.error('RULES: Tests + Build MUST pass before merge. Memory persists across sessions.');
}

export { server };

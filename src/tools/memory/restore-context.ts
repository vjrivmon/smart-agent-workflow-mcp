/**
 * restore_context Tool for Smart Agent Workflow MCP
 *
 * Restores context from a previous workflow, including decisions,
 * learnings, and related memories. Useful for resuming work or
 * learning from past implementations.
 */

import {
  getWorkflowContext,
  getMostRecentContext,
  findContextByFeature,
  searchMemory,
} from './store.js';
import type { RestoreContextArgs, RestoreContextResult, MemoryEntry } from './types.js';

export const restoreContextDefinition = {
  name: 'restore_context',
  description:
    'Restore context from a previous workflow. Retrieves decisions, learnings, files modified, and related memories. Use this to resume work on a feature or learn from past implementations.',
  inputSchema: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'Specific workflow ID to restore (restores most recent if not specified)',
      },
      feature_name: {
        type: 'string',
        description: 'Feature name to search for (fuzzy match)',
      },
      include_related: {
        type: 'boolean',
        description: 'Include related memory entries (default: true)',
        default: true,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of related memories to include (default: 10)',
        default: 10,
      },
    },
  },
};

export async function restoreContext(args: RestoreContextArgs): Promise<RestoreContextResult> {
  let context = null;

  // Try to find context by different methods
  if (args.workflow_id) {
    context = await getWorkflowContext(args.workflow_id);
  } else if (args.feature_name) {
    context = await findContextByFeature(args.feature_name);
  } else {
    context = await getMostRecentContext();
  }

  if (!context) {
    return {
      success: false,
      related_memories: [],
      message: args.workflow_id
        ? `No context found for workflow "${args.workflow_id}"`
        : args.feature_name
          ? `No context found for feature "${args.feature_name}"`
          : 'No saved contexts found. Use save_context to save workflow context.',
    };
  }

  // Get related memories
  let relatedMemories: MemoryEntry[] = [];
  const includeRelated = args.include_related !== false;
  const limit = args.limit || 10;

  if (includeRelated) {
    // Get memories from this workflow
    const workflowMemories = await searchMemory({
      workflow_id: context.workflow_id,
      limit: limit,
    });

    // Get memories with similar tags
    const featureTags = extractTagsFromFeatureName(context.feature_name);
    const tagMemories = await searchMemory({
      tags: featureTags,
      limit: Math.floor(limit / 2),
    });

    // Combine and deduplicate
    const allMemories = [...workflowMemories, ...tagMemories];
    const seen = new Set<string>();
    relatedMemories = allMemories.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    }).slice(0, limit);
  }

  // Build a helpful message
  const summaryParts = [];

  if (context.decisions.length > 0) {
    summaryParts.push(`${context.decisions.length} decisions`);
  }
  if (context.learnings.length > 0) {
    summaryParts.push(`${context.learnings.length} learnings`);
  }
  if (context.files_modified.length > 0) {
    summaryParts.push(`${context.files_modified.length} files modified`);
  }
  if (context.errors.length > 0) {
    summaryParts.push(`${context.errors.length} errors encountered`);
  }

  const summary = summaryParts.length > 0
    ? `Found context with ${summaryParts.join(', ')}`
    : 'Context found (no detailed entries)';

  return {
    success: true,
    context,
    related_memories: relatedMemories,
    message: `Restored context for "${context.feature_name}" (phase: ${context.phase}). ${summary}.`,
  };
}

/**
 * Extract tags from a feature name for searching related memories
 */
function extractTagsFromFeatureName(featureName: string): string[] {
  // Split by common separators and filter short words
  const words = featureName
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter((w) => w.length > 2);

  // Common programming terms that might be useful as tags
  const programmingTerms = [
    'api', 'auth', 'user', 'test', 'build', 'deploy',
    'config', 'setup', 'fix', 'bug', 'feature', 'add',
    'update', 'delete', 'create', 'refactor', 'docs',
    'style', 'ui', 'ux', 'db', 'database', 'cache',
    'error', 'handle', 'validate', 'form', 'input',
  ];

  // Keep words that are programming terms or longer than 4 chars
  return words.filter(
    (w) => programmingTerms.includes(w) || w.length > 4
  );
}

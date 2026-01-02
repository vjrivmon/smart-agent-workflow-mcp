/**
 * get_memory Tool for Smart Agent Workflow MCP
 *
 * Query the knowledge graph for relevant memories.
 * Supports filtering by type, tags, workflow, file, and importance.
 */

import { searchMemory, getMemoryStats } from './store.js';
import type { GetMemoryArgs, GetMemoryResult } from './types.js';

export const getMemoryDefinition = {
  name: 'get_memory',
  description:
    'Query the knowledge graph for relevant memories. Search by content, filter by type (decision, learning, error, etc.), tags, workflow, or file path. Returns sorted by importance and recency.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find in memory content and tags',
      },
      type: {
        type: 'string',
        enum: ['decision', 'learning', 'context', 'file_change', 'error', 'success'],
        description: 'Filter by memory type',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (returns entries matching any tag)',
      },
      workflow_id: {
        type: 'string',
        description: 'Filter by specific workflow ID',
      },
      file_path: {
        type: 'string',
        description: 'Filter by file path (partial match)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 20)',
        default: 20,
      },
      min_importance: {
        type: 'number',
        description: 'Minimum importance score 1-10 (default: 1)',
        minimum: 1,
        maximum: 10,
      },
    },
  },
};

export async function getMemory(args: GetMemoryArgs): Promise<GetMemoryResult> {
  // If no filters provided, return stats overview
  const hasFilters = args.query || args.type || args.tags || args.workflow_id || args.file_path;

  if (!hasFilters) {
    const stats = await getMemoryStats();

    if (stats.total_entries === 0) {
      return {
        success: true,
        entries: [],
        total_matches: 0,
        message: 'Memory is empty. Use save_context to store workflow context and learnings.',
      };
    }

    // Return most important/recent entries as overview
    const topEntries = await searchMemory({
      min_importance: 5,
      limit: args.limit || 20,
    });

    return {
      success: true,
      entries: topEntries,
      total_matches: stats.total_entries,
      message: formatStatsMessage(stats),
    };
  }

  // Perform search with filters
  const entries = await searchMemory({
    query: args.query,
    type: args.type,
    tags: args.tags,
    workflow_id: args.workflow_id,
    file_path: args.file_path,
    min_importance: args.min_importance,
    limit: args.limit || 20,
  });

  if (entries.length === 0) {
    return {
      success: true,
      entries: [],
      total_matches: 0,
      message: formatNoResultsMessage(args),
    };
  }

  return {
    success: true,
    entries,
    total_matches: entries.length,
    message: formatResultsMessage(entries, args),
  };
}

/**
 * Format stats message
 */
function formatStatsMessage(stats: {
  total_entries: number;
  total_contexts: number;
  by_type: Record<string, number>;
  contexts_list: string[];
}): string {
  const parts = [`Memory contains ${stats.total_entries} entries across ${stats.total_contexts} workflows.`];

  const typeBreakdown = Object.entries(stats.by_type)
    .map(([type, count]) => `${count} ${type}s`)
    .join(', ');

  if (typeBreakdown) {
    parts.push(`By type: ${typeBreakdown}.`);
  }

  if (stats.contexts_list.length > 0) {
    const recentContexts = stats.contexts_list.slice(0, 3);
    parts.push(`Recent workflows: ${recentContexts.join('; ')}.`);
  }

  return parts.join(' ');
}

/**
 * Format no results message with suggestions
 */
function formatNoResultsMessage(args: GetMemoryArgs): string {
  const filters = [];

  if (args.query) filters.push(`query "${args.query}"`);
  if (args.type) filters.push(`type "${args.type}"`);
  if (args.tags?.length) filters.push(`tags [${args.tags.join(', ')}]`);
  if (args.workflow_id) filters.push(`workflow "${args.workflow_id}"`);
  if (args.file_path) filters.push(`file "${args.file_path}"`);
  if (args.min_importance) filters.push(`importance >= ${args.min_importance}`);

  return `No memories found matching ${filters.join(', ')}. Try broader search terms or fewer filters.`;
}

/**
 * Format results message
 */
function formatResultsMessage(
  entries: Array<{ type: string; importance: number }>,
  args: GetMemoryArgs
): string {
  const types = new Set(entries.map((e) => e.type));
  const avgImportance = entries.reduce((sum, e) => sum + e.importance, 0) / entries.length;

  const parts = [`Found ${entries.length} memories`];

  if (types.size === 1) {
    parts.push(`(all ${[...types][0]}s)`);
  } else {
    parts.push(`(${[...types].join(', ')})`);
  }

  parts.push(`with avg importance ${avgImportance.toFixed(1)}/10`);

  if (args.query) {
    parts.push(`matching "${args.query}"`);
  }

  return parts.join(' ') + '.';
}

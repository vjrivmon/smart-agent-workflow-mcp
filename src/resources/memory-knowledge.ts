/**
 * memory://knowledge Resource for Smart Agent Workflow MCP
 *
 * Provides an overview of the knowledge graph including:
 * - Memory statistics
 * - Recent learnings and decisions
 * - Workflow contexts summary
 */

import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import { loadMemoryStore, getMemoryStats, searchMemory } from '../tools/memory/index.js';

export const memoryKnowledgeResource: Resource = {
  uri: 'memory://knowledge',
  name: 'Knowledge Graph',
  description: 'Overview of accumulated knowledge: decisions, learnings, errors, and workflow contexts',
  mimeType: 'application/json',
};

interface KnowledgeOverview {
  summary: {
    total_entries: number;
    total_contexts: number;
    by_type: Record<string, number>;
  };
  recent_learnings: Array<{
    content: string;
    workflow: string;
    created_at: string;
  }>;
  recent_decisions: Array<{
    content: string;
    workflow: string;
    created_at: string;
  }>;
  recent_errors: Array<{
    content: string;
    workflow: string;
    created_at: string;
  }>;
  workflows: Array<{
    id: string;
    feature_name: string;
    phase: string;
    decisions_count: number;
    learnings_count: number;
    files_count: number;
    saved_at: string;
  }>;
  insights: string[];
}

export async function getMemoryKnowledgeResource(): Promise<string> {
  const store = await loadMemoryStore();
  const stats = await getMemoryStats();

  // Get recent learnings
  const learnings = await searchMemory({ type: 'learning', limit: 5 });
  const decisions = await searchMemory({ type: 'decision', limit: 5 });
  const errors = await searchMemory({ type: 'error', limit: 5 });

  // Build overview
  const overview: KnowledgeOverview = {
    summary: {
      total_entries: stats.total_entries,
      total_contexts: stats.total_contexts,
      by_type: stats.by_type,
    },
    recent_learnings: learnings.map((l) => ({
      content: l.content,
      workflow: l.workflow_id || 'unknown',
      created_at: l.created_at,
    })),
    recent_decisions: decisions.map((d) => ({
      content: d.content,
      workflow: d.workflow_id || 'unknown',
      created_at: d.created_at,
    })),
    recent_errors: errors.map((e) => ({
      content: e.content,
      workflow: e.workflow_id || 'unknown',
      created_at: e.created_at,
    })),
    workflows: store.contexts.map((c) => ({
      id: c.workflow_id,
      feature_name: c.feature_name,
      phase: c.phase,
      decisions_count: c.decisions.length,
      learnings_count: c.learnings.length,
      files_count: c.files_modified.length,
      saved_at: c.saved_at,
    })),
    insights: generateInsights(store, stats),
  };

  return JSON.stringify(overview, null, 2);
}

/**
 * Generate insights from the memory store
 */
function generateInsights(
  store: { entries: Array<{ type: string; importance: number }>; contexts: Array<{ errors: string[] }> },
  stats: { total_entries: number; total_contexts: number; by_type: Record<string, number> }
): string[] {
  const insights: string[] = [];

  // Check for patterns
  if (stats.total_entries === 0) {
    insights.push('Memory is empty. Start using save_context to accumulate knowledge.');
    return insights;
  }

  // Error rate
  const errorCount = stats.by_type['error'] || 0;
  if (errorCount > 0 && stats.total_entries > 0) {
    const errorRate = (errorCount / stats.total_entries) * 100;
    if (errorRate > 30) {
      insights.push(`High error rate (${errorRate.toFixed(0)}%). Consider reviewing error patterns.`);
    }
  }

  // Learning rate
  const learningCount = stats.by_type['learning'] || 0;
  if (learningCount > 5) {
    insights.push(`${learningCount} learnings accumulated. Knowledge base is growing.`);
  }

  // Decision patterns
  const decisionCount = stats.by_type['decision'] || 0;
  if (decisionCount > 0 && stats.total_contexts > 0) {
    const avgDecisions = decisionCount / stats.total_contexts;
    insights.push(`Average ${avgDecisions.toFixed(1)} decisions per workflow.`);
  }

  // Context count
  if (stats.total_contexts > 5) {
    insights.push(`${stats.total_contexts} workflow contexts saved. Rich history available.`);
  }

  // High importance entries
  const highImportance = store.entries.filter((e) => e.importance >= 8).length;
  if (highImportance > 0) {
    insights.push(`${highImportance} high-importance entries (importance >= 8).`);
  }

  // Suggest actions
  if (learningCount === 0 && stats.total_entries > 0) {
    insights.push('No learnings recorded. Use save_context with learnings to capture insights.');
  }

  return insights;
}

/**
 * get_context_health Tool - Smart Agent Workflow MCP v0.6.0
 *
 * Returns current context health metrics.
 * Use this to monitor context usage and decide when to checkpoint.
 */

import {
  getMetrics,
  getSessionMinutes,
  trackOperation,
} from '../../lib/context-health.js';
import type { GetContextHealthArgs, GetContextHealthResult } from './types.js';

export const getContextHealthDefinition = {
  name: 'get_context_health',
  description:
    'Get current context health metrics: health score, operations count, estimated tokens, ' +
    'session duration, and whether checkpoint is recommended. Use this to monitor context ' +
    'usage and anticipate compaction.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      include_log: {
        type: 'boolean',
        default: false,
        description: 'Include list of recent operations (last 10)',
      },
    },
  },
};

export async function getContextHealth(
  args: GetContextHealthArgs
): Promise<GetContextHealthResult> {
  const { include_log = false } = args;

  // Track this operation (minimal cost)
  await trackOperation('get_context_health', 50);

  // Get all metrics
  const metrics = await getMetrics();
  const sessionMinutes = await getSessionMinutes();

  // Build result
  const result: GetContextHealthResult = {
    health_score: metrics.health_score,
    health_status: metrics.health_status,
    operations_count: metrics.operations_count,
    estimated_tokens: metrics.estimated_tokens,
    session_minutes: sessionMinutes,
    should_checkpoint: metrics.should_checkpoint,
    last_checkpoint: metrics.last_checkpoint,
    message: metrics.message,
  };

  // Include operation log if requested
  if (include_log) {
    // Read session file to get operations log
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { getProjectRoot } = await import('../../lib/git.js');

      const projectRoot = await getProjectRoot();
      const sessionPath = path.join(projectRoot, '.smart-agent/session.json');
      const content = await fs.readFile(sessionPath, 'utf-8');
      const session = JSON.parse(content);

      // Return last 10 operations
      result.recent_operations = session.operations_log?.slice(-10) || [];
    } catch {
      result.recent_operations = [];
    }
  }

  return result;
}

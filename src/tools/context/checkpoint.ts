/**
 * checkpoint_context Tool - Smart Agent Workflow MCP v0.6.0
 *
 * Saves the current workflow state and resets health score.
 * Use this to create a "save point" before context is lost to compaction.
 */

import {
  getMetrics,
  markCheckpoint,
  resetSession,
  trackOperation,
} from '../../lib/context-health.js';
import { saveContext } from '../memory/save-context.js';
import { getCurrentWorkflow } from '../workflow/state-machine.js';
import type { CheckpointContextArgs, CheckpointContextResult } from './types.js';

export const checkpointContextDefinition = {
  name: 'checkpoint_context',
  description:
    'Save the current workflow state and reset health score. Creates a checkpoint before context ' +
    'is lost to compaction. Use when health is critical or before long operations. ' +
    'Returns health before/after and entries saved.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      message: {
        type: 'string',
        description: 'Optional message to include with checkpoint',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to categorize this checkpoint (default: ["checkpoint"])',
      },
      force: {
        type: 'boolean',
        default: false,
        description: 'Force checkpoint even if health is good',
      },
    },
  },
};

export async function checkpointContext(
  args: CheckpointContextArgs
): Promise<CheckpointContextResult> {
  const { message, tags = ['checkpoint'], force = false } = args;

  try {
    // Track this operation
    await trackOperation('checkpoint_context', 200);

    // Get current health
    const metrics = await getMetrics();
    const healthBefore = metrics.health_score;

    // Check if checkpoint is needed (unless forced)
    if (!force && healthBefore >= 70) {
      return {
        success: true,
        entries_saved: 0,
        health_before: healthBefore,
        health_after: healthBefore,
        message: `Health is good (${healthBefore}%). Use force=true to checkpoint anyway.`,
      };
    }

    // Get current workflow context
    const workflow = await getCurrentWorkflow();
    let entriesSaved = 0;

    // Save workflow context to memory
    if (workflow) {
      const learnings = [
        `Checkpoint at phase: ${workflow.current_phase}`,
        `Feature: ${workflow.feature_name}`,
        `Health at checkpoint: ${healthBefore}%`,
      ];

      if (message) {
        learnings.push(`Note: ${message}`);
      }

      await saveContext({
        workflow_id: workflow.id,
        learnings,
        tags: [...tags, 'auto-checkpoint', workflow.current_phase],
        notes: message || `Auto-checkpoint (health was ${healthBefore}%)`,
      });

      entriesSaved = learnings.length;
    } else {
      // No active workflow, save general checkpoint
      await saveContext({
        workflow_id: 'session-checkpoint',
        learnings: [
          `Session checkpoint at health ${healthBefore}%`,
          `Operations: ${metrics.operations_count}`,
          `Estimated tokens: ${metrics.estimated_tokens}`,
          message || 'Manual checkpoint',
        ],
        tags: [...tags, 'session'],
        notes: message || `Session checkpoint (health was ${healthBefore}%)`,
      });

      entriesSaved = 4;
    }

    // Mark checkpoint and reset session
    await markCheckpoint();
    await resetSession();

    // Get new health (should be 100)
    const newMetrics = await getMetrics();

    const resultMessage =
      `[context] Checkpoint saved. Health restored: ${healthBefore}% → ${newMetrics.health_score}%`;

    return {
      success: true,
      entries_saved: entriesSaved,
      health_before: healthBefore,
      health_after: newMetrics.health_score,
      message: resultMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      entries_saved: 0,
      health_before: 0,
      health_after: 0,
      message: `Checkpoint failed: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

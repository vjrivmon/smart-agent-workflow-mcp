/**
 * rollback_feature Tool - Smart Agent Workflow MCP v0.3.0
 *
 * Rolls back a failed or unwanted feature:
 * - Aborts the worktree without merging
 * - Cleans up the branch
 * - Records the rollback reason
 */

import { abortWorktree } from '../../lib/git.js';
import { saveContext } from '../memory/save-context.js';
import {
  getWorkflowByPath,
  rollbackWorkflow,
  clearCurrentWorkflow,
} from './state-machine.js';
import type { RollbackFeatureArgs, WorkflowResult } from './types.js';

export const rollbackFeatureDefinition = {
  name: 'rollback_feature',
  description:
    'Rolls back a failed or unwanted feature: aborts worktree, cleans up branch, records reason. ' +
    'Use this when you need to abandon a feature without merging.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      worktree_path: {
        type: 'string',
        description: 'Path to the worktree to rollback',
      },
      reason: {
        type: 'string',
        description: 'Reason for the rollback (for logging and future reference)',
      },
      keep_branch: {
        type: 'boolean',
        default: false,
        description: 'Keep the branch for debugging (default: delete)',
      },
    },
    required: ['worktree_path', 'reason'],
  },
};

export async function rollbackFeature(args: RollbackFeatureArgs): Promise<WorkflowResult> {
  const { worktree_path, reason, keep_branch = false } = args;

  // Get workflow
  const workflow = await getWorkflowByPath(worktree_path);

  try {
    // Abort the worktree
    await abortWorktree(worktree_path, reason);

    // Update workflow state if exists
    if (workflow) {
      await rollbackWorkflow(workflow.id, reason);

      // === AUTO-SAVE CONTEXT (v0.5.0) ===
      try {
        await saveContext({
          workflow_id: workflow.id,
          learnings: [
            `Rolled back feature: ${workflow.feature_name}`,
            `Reason: ${reason}`,
            `Phase at rollback: ${workflow.current_phase}`,
          ],
          tags: ['rollback', 'error', workflow.feature_type || 'feature'],
          notes: `Feature was rolled back. Reason: ${reason}`,
        });
      } catch (memoryError) {
        // Memory save failure should not fail the rollback
        console.error('[memory] Failed to save context:', memoryError);
      }

      await clearCurrentWorkflow();

      return {
        success: true,
        workflow_id: workflow.id,
        phase: 'rolled_back',
        message: `Feature "${workflow.feature_name}" rolled back.`,
        next_action:
          'The worktree and branch have been removed. You can start fresh with start_feature.',
      };
    }

    // No workflow found, but worktree was aborted
    return {
      success: true,
      workflow_id: '',
      phase: 'rolled_back',
      message: 'Worktree rolled back (no workflow found).',
      next_action: 'The worktree has been removed. You can start fresh with start_feature.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      workflow_id: workflow?.id || '',
      phase: 'failed',
      message: `Rollback failed: ${message}`,
      error: message,
      next_action: 'Try manual cleanup: git worktree remove <path> --force',
    };
  }
}

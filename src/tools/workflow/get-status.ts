/**
 * get_workflow_status Tool - Smart Agent Workflow MCP v0.3.0
 *
 * Gets the current status of all active workflows.
 */

import {
  getCurrentWorkflow,
  getWorkflowHistory,
} from './state-machine.js';
import type { WorkflowState } from './types.js';

export const getWorkflowStatusDefinition = {
  name: 'get_workflow_status',
  description:
    'Gets the current status of all active workflows, including phase, steps, and progress.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      include_history: {
        type: 'boolean',
        default: false,
        description: 'Include completed/rolled-back workflows from history',
      },
      limit: {
        type: 'number',
        default: 10,
        description: 'Maximum number of historical workflows to return',
      },
    },
    required: [],
  },
};

interface WorkflowStatusResult {
  current: WorkflowState | null;
  current_summary?: string;
  history?: WorkflowState[];
  stats?: {
    total_completed: number;
    total_failed: number;
    total_rolled_back: number;
    average_duration_ms?: number;
  };
}

export async function getWorkflowStatus(args: {
  include_history?: boolean;
  limit?: number;
}): Promise<WorkflowStatusResult> {
  const { include_history = false, limit = 10 } = args;

  // Get current workflow
  const current = await getCurrentWorkflow();

  // Generate summary for current workflow
  let current_summary: string | undefined;
  if (current) {
    const completedSteps = current.steps.filter((s) => s.status === 'completed').length;
    const totalSteps = current.steps.length;
    const progress = Math.round((completedSteps / totalSteps) * 100);

    const currentStep = current.steps.find((s) => s.status === 'in_progress');
    const currentStepName = currentStep?.name || 'Unknown';

    current_summary =
      `Feature: ${current.feature_name}\n` +
      `Phase: ${current.current_phase}\n` +
      `Progress: ${progress}% (${completedSteps}/${totalSteps} steps)\n` +
      `Current Step: ${currentStepName}\n` +
      `Worktree: ${current.worktree_path}\n` +
      `Branch: ${current.branch_name}`;
  }

  const result: WorkflowStatusResult = {
    current,
    current_summary,
  };

  // Include history if requested
  if (include_history) {
    const allHistory = await getWorkflowHistory();

    // Filter out current workflow and limit results
    const filteredHistory = allHistory
      .filter((w) => w.id !== current?.id)
      .slice(-limit)
      .reverse(); // Most recent first

    result.history = filteredHistory;

    // Calculate stats
    const completed = allHistory.filter((w) => w.current_phase === 'completed');
    const failed = allHistory.filter((w) => w.current_phase === 'failed');
    const rolledBack = allHistory.filter((w) => w.current_phase === 'rolled_back');

    // Calculate average duration for completed workflows
    let averageDuration: number | undefined;
    const completedWithDuration = completed.filter((w) => w.completed_at);
    if (completedWithDuration.length > 0) {
      const totalDuration = completedWithDuration.reduce((sum, w) => {
        const start = new Date(w.created_at).getTime();
        const end = new Date(w.completed_at!).getTime();
        return sum + (end - start);
      }, 0);
      averageDuration = Math.round(totalDuration / completedWithDuration.length);
    }

    result.stats = {
      total_completed: completed.length,
      total_failed: failed.length,
      total_rolled_back: rolledBack.length,
      average_duration_ms: averageDuration,
    };
  }

  return result;
}

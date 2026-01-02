/**
 * workflow://current Resource - Smart Agent Workflow MCP v0.3.0
 *
 * Provides the current active workflow state.
 */

import { getCurrentWorkflow, getWorkflowHistory } from '../tools/workflow/state-machine.js';

export const workflowCurrentResource = {
  uri: 'workflow://current',
  name: 'Current Workflow',
  description: 'Current active workflow with phase, steps, and progress',
  mimeType: 'application/json',
};

export async function getWorkflowCurrentResource(): Promise<string> {
  const current = await getCurrentWorkflow();

  if (!current) {
    return JSON.stringify(
      {
        status: 'idle',
        message: 'No active workflow. Use start_feature to begin.',
        hint: 'Run start_feature with feature_name and description to create a new workflow.',
      },
      null,
      2
    );
  }

  // Calculate progress
  const completedSteps = current.steps.filter((s) => s.status === 'completed').length;
  const totalSteps = current.steps.length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  // Find current step
  const currentStep = current.steps.find((s) => s.status === 'in_progress');

  // Build progress visualization
  const progressBar = buildProgressBar(progressPercent);

  // Get next actions based on phase
  const nextActions = getNextActions(current.current_phase);

  return JSON.stringify(
    {
      workflow_id: current.id,
      feature_name: current.feature_name,
      feature_type: current.feature_type,
      description: current.description,

      phase: current.current_phase,
      progress: {
        percent: progressPercent,
        completed_steps: completedSteps,
        total_steps: totalSteps,
        bar: progressBar,
      },

      current_step: currentStep?.name || null,

      worktree: {
        path: current.worktree_path,
        branch: current.branch_name,
        base: current.base_branch,
      },

      steps: current.steps.map((s) => ({
        name: s.name,
        status: s.status,
        phase: s.phase,
        duration: s.started_at && s.completed_at
          ? `${Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000)}s`
          : null,
        error: s.error || null,
      })),

      test_results: current.test_results || null,
      build_results: current.build_results || null,

      timestamps: {
        created: current.created_at,
        updated: current.updated_at,
        completed: current.completed_at || null,
      },

      next_actions: nextActions,

      error: current.error || null,
    },
    null,
    2
  );
}

function buildProgressBar(percent: number): string {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  return '[' + '▓'.repeat(filled) + '░'.repeat(empty) + '] ' + percent + '%';
}

function getNextActions(phase: string): string[] {
  const actions: Record<string, string[]> = {
    planning: [
      'Navigate to the worktree directory',
      'Start implementing the feature',
      'Create tests with generate_test_template',
    ],
    implementing: [
      'Continue implementing the feature',
      'When ready, run complete_feature to test and merge',
      'Or rollback_feature if you want to abort',
    ],
    testing: [
      'Wait for tests to complete',
      'If tests fail, fix and run complete_feature again',
    ],
    building: [
      'Wait for build to complete',
      'If build fails, fix and run complete_feature again',
    ],
    merging: [
      'Wait for merge to complete',
      'If conflicts occur, resolve manually',
    ],
    documenting: [
      'Documentation update in progress',
    ],
    completed: [
      'Feature completed successfully!',
      'Run git pull to update your main branch',
      'Push to remote: git push origin main',
    ],
    failed: [
      'Check the error message above',
      'Fix the issue and run complete_feature again',
      'Or run rollback_feature to abort',
    ],
    rolled_back: [
      'Feature was rolled back',
      'Start fresh with start_feature',
    ],
    idle: [
      'No active workflow',
      'Start a new feature with start_feature',
    ],
  };

  return actions[phase] || ['Check workflow status'];
}

/**
 * start_feature Tool - Smart Agent Workflow MCP v0.3.0
 *
 * Starts a new feature with full workflow:
 * - Creates ephemeral worktree
 * - Sets up environment
 * - Initializes workflow tracking
 */

import { createWorktree } from '../../lib/git.js';
import { createWorkflow } from './state-machine.js';
import type { StartFeatureArgs, WorkflowResult, FeatureType } from './types.js';

export const startFeatureDefinition = {
  name: 'start_feature',
  description:
    'Starts a new feature with full workflow: creates worktree, sets up environment, initializes tracking. ' +
    'This is the recommended way to begin any development work.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      feature_name: {
        type: 'string',
        description: 'Short name for the feature (used in branch name)',
      },
      description: {
        type: 'string',
        description: 'Full description of what this feature does',
      },
      type: {
        type: 'string',
        enum: ['feature', 'bugfix', 'refactor', 'docs'],
        default: 'feature',
        description: 'Type of work (affects commit prefix)',
      },
      base_branch: {
        type: 'string',
        default: 'main',
        description: 'Base branch to create from',
      },
    },
    required: ['feature_name', 'description'],
  },
};

export async function startFeature(args: StartFeatureArgs): Promise<WorkflowResult> {
  const {
    feature_name,
    description,
    type = 'feature',
    base_branch = 'main',
  } = args;

  try {
    // Step 1: Create worktree
    const worktreeInfo = await createWorktree(feature_name, base_branch);

    // Step 2: Initialize workflow tracking
    const workflow = await createWorkflow(
      feature_name,
      description,
      type as FeatureType,
      worktreeInfo.path,
      worktreeInfo.branch,
      base_branch
    );

    // Step 3: Generate initial guidance
    const nextAction = getNextActionGuidance(type as FeatureType);

    return {
      success: true,
      workflow_id: workflow.id,
      phase: workflow.current_phase,
      message: `Feature "${feature_name}" started successfully.`,
      worktree_path: worktreeInfo.path,
      branch_name: worktreeInfo.branch,
      next_action: nextAction,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      workflow_id: '',
      phase: 'failed',
      message: `Failed to start feature: ${message}`,
      error: message,
    };
  }
}

function getNextActionGuidance(type: FeatureType): string {
  const guidance: Record<FeatureType, string> = {
    feature:
      'Next steps:\n' +
      '1. Navigate to the worktree: cd <worktree_path>\n' +
      '2. Implement your feature\n' +
      '3. Create E2E tests with generate_test_template\n' +
      '4. When ready, run complete_feature to merge',
    bugfix:
      'Next steps:\n' +
      '1. Navigate to the worktree: cd <worktree_path>\n' +
      '2. Write a failing test that reproduces the bug\n' +
      '3. Fix the bug until the test passes\n' +
      '4. When ready, run complete_feature to merge',
    refactor:
      'Next steps:\n' +
      '1. Navigate to the worktree: cd <worktree_path>\n' +
      '2. Ensure existing tests pass before changes\n' +
      '3. Refactor in small increments\n' +
      '4. When ready, run complete_feature to merge',
    docs:
      'Next steps:\n' +
      '1. Navigate to the worktree: cd <worktree_path>\n' +
      '2. Update documentation files\n' +
      '3. Verify build passes (npm run build)\n' +
      '4. When ready, run complete_feature to merge',
  };

  return guidance[type];
}

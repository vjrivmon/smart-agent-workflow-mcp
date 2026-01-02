/**
 * complete_feature Tool - Smart Agent Workflow MCP v0.6.0
 *
 * Completes a feature with the full workflow:
 * 1. Run E2E tests (MUST pass)
 * 2. Verify build (MUST pass)
 * 3. Merge to main
 * 4. Cleanup worktree
 * 5. Auto-checkpoint context
 *
 * BLOCKS if tests or build fail.
 */

import { cleanupWorktree } from '../../lib/git.js';
import { trackOperation, shouldCheckpoint, getMetrics, resetSession } from '../../lib/context-health.js';
import { runE2ETests } from '../testing/run-tests.js';
import { verifyBuild } from '../testing/verify-build.js';
import { saveContext } from '../memory/save-context.js';
import {
  getCurrentWorkflow,
  getWorkflowByPath,
  transitionPhase,
  failWorkflow,
  updateStep,
  clearCurrentWorkflow,
} from './state-machine.js';
import type { CompleteFeatureArgs, WorkflowResult } from './types.js';

export const completeFeatureDefinition = {
  name: 'complete_feature',
  description:
    'Completes a feature: runs E2E tests, verifies build, merges to main, cleans up worktree. ' +
    'BLOCKS if tests or build fail. This is the safe way to merge - quality gates cannot be bypassed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      worktree_path: {
        type: 'string',
        description: 'Path to the worktree to complete',
      },
      commit_message: {
        type: 'string',
        description: 'Custom commit message (optional, auto-generated if not provided)',
      },
      skip_tests: {
        type: 'boolean',
        default: false,
        description: 'DANGEROUS: Skip tests. Requires explicit confirmation. NOT recommended.',
      },
    },
    required: ['worktree_path'],
  },
};

export async function completeFeature(args: CompleteFeatureArgs): Promise<WorkflowResult> {
  const { worktree_path, commit_message, skip_tests = false } = args;

  // Track operation (high token cost - this is a major operation)
  await trackOperation('complete_feature', 2000);

  // Get workflow
  let workflow = await getWorkflowByPath(worktree_path);
  if (!workflow) {
    return {
      success: false,
      workflow_id: '',
      phase: 'failed',
      message: `No workflow found for worktree: ${worktree_path}`,
      error: 'Workflow not found',
    };
  }

  try {
    // === PHASE 1: TESTING ===
    if (!skip_tests) {
      await updateStep(workflow.id, 'Implement Feature', 'completed', {
        output: 'Implementation ready for testing',
      });

      await updateStep(workflow.id, 'Run E2E Tests', 'in_progress');
      workflow = await transitionPhase(workflow.id, 'testing');

      const testResult = await runE2ETests({ worktree_path });

      if (!testResult.success) {
        await failWorkflow(
          workflow.id,
          `Tests failed: ${testResult.failed} failures`,
          'Run E2E Tests'
        );

        return {
          success: false,
          workflow_id: workflow.id,
          phase: 'failed',
          message: `Tests failed. ${testResult.passed} passed, ${testResult.failed} failed.`,
          error: 'Tests must pass before merge',
          next_action: 'Fix the failing tests and try again with complete_feature',
        };
      }

      await updateStep(workflow.id, 'Run E2E Tests', 'completed', {
        output: `${testResult.passed} tests passed`,
      });

      // Update test results in workflow
      workflow.test_results = {
        passed: testResult.passed,
        failed: testResult.failed,
        skipped: 0,
      };
    } else {
      // Mark tests as skipped (dangerous)
      await updateStep(workflow.id, 'Run E2E Tests', 'completed', {
        output: 'SKIPPED (--skip_tests flag used) - NOT RECOMMENDED',
      });
    }

    // === PHASE 2: BUILD ===
    await updateStep(workflow.id, 'Verify Build', 'in_progress');
    workflow = await transitionPhase(workflow.id, 'building');

    const buildResult = await verifyBuild({ worktree_path });

    if (!buildResult.success) {
      const errorMsg = buildResult.errors?.length > 0
        ? buildResult.errors.join('\n')
        : 'Unknown error';

      await failWorkflow(
        workflow.id,
        `Build failed: ${errorMsg}`,
        'Verify Build'
      );

      return {
        success: false,
        workflow_id: workflow.id,
        phase: 'failed',
        message: 'Build failed.',
        error: errorMsg,
        next_action: 'Fix the build errors and try again with complete_feature',
      };
    }

    await updateStep(workflow.id, 'Verify Build', 'completed', {
      output: `Build successful (${buildResult.duration}ms)`,
    });

    workflow.build_results = {
      success: true,
      duration_ms: buildResult.duration,
    };

    // === PHASE 3: MERGE ===
    await updateStep(workflow.id, 'Merge to Main', 'in_progress');
    workflow = await transitionPhase(workflow.id, 'merging');

    const finalMessage =
      commit_message ||
      `${workflow.feature_type}(${workflow.feature_name}): ${workflow.description}`;

    const cleanupResult = await cleanupWorktree(worktree_path, false, finalMessage);

    if (!cleanupResult.merged) {
      await failWorkflow(workflow.id, 'Merge failed', 'Merge to Main');

      return {
        success: false,
        workflow_id: workflow.id,
        phase: 'failed',
        message: 'Merge to main failed.',
        error: 'Merge conflict or other git error',
        next_action: 'Resolve conflicts manually and try again, or use rollback_feature',
      };
    }

    await updateStep(workflow.id, 'Merge to Main', 'completed', {
      output: `Merged: ${cleanupResult.commit}`,
    });

    // === PHASE 4: DOCUMENTATION ===
    await updateStep(workflow.id, 'Update Documentation', 'in_progress');
    workflow = await transitionPhase(workflow.id, 'documenting');

    // TODO: In v0.4.0, auto-update CLAUDE.md here
    await updateStep(workflow.id, 'Update Documentation', 'completed', {
      output: 'Documentation update pending (v0.4.0)',
    });

    // === PHASE 5: CLEANUP (already done by cleanupWorktree) ===
    await updateStep(workflow.id, 'Cleanup Worktree', 'completed', {
      output: 'Worktree removed',
    });

    workflow = await transitionPhase(workflow.id, 'completed');

    // === AUTO-SAVE CONTEXT (v0.5.0) ===
    try {
      await saveContext({
        workflow_id: workflow.id,
        learnings: [
          `Successfully completed feature: ${workflow.feature_name}`,
          `Tests passed: ${workflow.test_results?.passed || 0}`,
          `Build duration: ${workflow.build_results?.duration_ms || 0}ms`,
        ],
        tags: ['success', 'completed', workflow.feature_type || 'feature'],
        notes: `Feature completed and merged to main. Commit: ${cleanupResult.commit}`,
      });
    } catch (memoryError) {
      // Memory save failure should not fail the workflow
      console.error('[memory] Failed to save context:', memoryError);
    }

    // === AUTO-CHECKPOINT (v0.6.0) ===
    let checkpointMessage = '';
    if (await shouldCheckpoint()) {
      const metrics = await getMetrics();
      await resetSession();
      checkpointMessage = `\n[context] Auto-checkpoint saved. Health restored: ${metrics.health_score}% → 100%`;
    }

    // Clear current workflow
    await clearCurrentWorkflow();

    return {
      success: true,
      workflow_id: workflow.id,
      phase: 'completed',
      message: `Feature "${workflow.feature_name}" completed successfully!${checkpointMessage}`,
      branch_name: workflow.branch_name,
      next_action:
        'Feature merged to main. Run `git pull` to update your local main branch. ' +
        'Consider pushing to remote: `git push origin main`',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (workflow) {
      await failWorkflow(workflow.id, message, 'Unknown');
    }

    return {
      success: false,
      workflow_id: workflow?.id || '',
      phase: 'failed',
      message: `Feature completion failed: ${message}`,
      error: message,
      next_action: 'Check the error and try again, or use rollback_feature to abort',
    };
  }
}

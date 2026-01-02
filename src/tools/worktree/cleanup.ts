/**
 * cleanup_worktree tool - Merges worktree to main and removes it
 *
 * IMPORTANT: This tool REQUIRES tests to pass before merge.
 * This is the core differentiator of Smart Agent Workflow MCP.
 */

import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { cleanupWorktree as gitCleanupWorktree } from '../../lib/git.js';
import type { CleanupWorktreeResult } from '../../types/index.js';

export const cleanupWorktreeSchema = z.object({
  worktree_path: z.string().describe('Path to worktree'),
  force: z.boolean().default(false).describe('Force cleanup even if tests failed (NOT recommended)'),
  commit_message: z.string().optional().describe('Custom commit message for the merge'),
});

export type CleanupWorktreeInput = z.infer<typeof cleanupWorktreeSchema>;

interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  timestamp: string;
}

interface BuildResult {
  success: boolean;
  exit_code: number;
  timestamp: string;
}

interface GateStatus {
  tests_passed: boolean;
  build_passed: boolean;
  gate_passed: boolean;
  test_results: TestResult | null;
  build_results: BuildResult | null;
  message: string;
}

/**
 * Check if the testing gate has been passed
 */
function checkTestingGate(worktreePath: string): GateStatus {
  const resultsDir = join(worktreePath, '.smart-agent-workflow');
  const testResultsFile = join(resultsDir, 'test-results.json');
  const buildResultsFile = join(resultsDir, 'build-results.json');

  let testResults: TestResult | null = null;
  let buildResults: BuildResult | null = null;

  // Read test results
  if (existsSync(testResultsFile)) {
    try {
      testResults = JSON.parse(readFileSync(testResultsFile, 'utf-8'));
    } catch {
      // Invalid file, treat as no results
    }
  }

  // Read build results
  if (existsSync(buildResultsFile)) {
    try {
      buildResults = JSON.parse(readFileSync(buildResultsFile, 'utf-8'));
    } catch {
      // Invalid file, treat as no results
    }
  }

  const testsPassed = testResults?.success ?? false;
  const buildPassed = buildResults?.success ?? false;
  const gatePassed = testsPassed && buildPassed;

  // Generate appropriate message
  let message: string;

  if (!testResults && !buildResults) {
    message = 'GATE BLOCKED: No tests or build results found. Run run_e2e_tests and verify_build first.';
  } else if (!testResults) {
    message = 'GATE BLOCKED: No test results found. Run run_e2e_tests first.';
  } else if (!buildResults) {
    message = 'GATE BLOCKED: No build results found. Run verify_build first.';
  } else if (!testsPassed && !buildPassed) {
    message = `GATE BLOCKED: Tests failed (${testResults.failed} failures) and build failed. Fix issues and re-run.`;
  } else if (!testsPassed) {
    message = `GATE BLOCKED: Tests failed with ${testResults.failed} failures. Fix tests and re-run run_e2e_tests.`;
  } else if (!buildPassed) {
    message = 'GATE BLOCKED: Build failed. Fix build errors and re-run verify_build.';
  } else {
    message = `GATE PASSED: ${testResults.passed} tests passed, build succeeded. Ready for merge.`;
  }

  return {
    tests_passed: testsPassed,
    build_passed: buildPassed,
    gate_passed: gatePassed,
    test_results: testResults,
    build_results: buildResults,
    message,
  };
}

export async function cleanupWorktree(input: CleanupWorktreeInput): Promise<CleanupWorktreeResult> {
  const { worktree_path, force, commit_message } = input;

  // Check the testing gate FIRST
  const gateStatus = checkTestingGate(worktree_path);

  // If gate not passed and not forcing, block the cleanup
  if (!gateStatus.gate_passed && !force) {
    return {
      success: false,
      merged: false,
      message: gateStatus.message,
      gate_status: gateStatus,
    };
  }

  // If forcing despite failed gate, add warning
  if (!gateStatus.gate_passed && force) {
    console.error(
      '⚠️  WARNING: Forcing merge despite failed testing gate. This is NOT recommended!\n' +
      `Gate status: ${gateStatus.message}`
    );
  }

  try {
    const result = await gitCleanupWorktree(worktree_path, force, commit_message);

    return {
      success: true,
      merged: result.merged,
      commit: result.commit,
      message: gateStatus.gate_passed
        ? `Testing gate PASSED. Worktree merged and cleaned up. Commit: ${result.commit}`
        : `⚠️ FORCED: Testing gate was NOT passed. Worktree merged and cleaned up. Commit: ${result.commit}`,
      gate_status: gateStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      merged: false,
      message: `Failed to cleanup worktree: ${message}`,
      gate_status: gateStatus,
    };
  }
}

export const cleanupWorktreeDefinition = {
  name: 'cleanup_worktree',
  description:
    'Merges worktree to main and removes it. REQUIRES tests and build to pass first! ' +
    'Run run_e2e_tests and verify_build before calling this. Use force=true to bypass (NOT recommended).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      worktree_path: {
        type: 'string',
        description: 'Path to worktree',
      },
      force: {
        type: 'boolean',
        description: 'Force cleanup even if tests failed. WARNING: This bypasses the testing gate!',
        default: false,
      },
      commit_message: {
        type: 'string',
        description: 'Custom commit message for the merge. If not provided, uses default message.',
      },
    },
    required: ['worktree_path'],
  },
};

/**
 * Resource: tests://latest
 *
 * Returns the latest test results from all worktrees.
 * This resource provides a quick overview of the testing gate status.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  test_path: string;
  attempts: number;
  timestamp: string;
}

interface BuildResult {
  success: boolean;
  duration: number;
  script: string;
  exit_code: number;
  timestamp: string;
  warnings: string[];
  errors: string[];
}

interface WorktreeTestResults {
  path: string;
  tests: TestResult | null;
  build: BuildResult | null;
  gate_passed: boolean;
  last_run: string | null;
}

interface TestResultsResource {
  worktrees: WorktreeTestResults[];
  summary: {
    total_worktrees: number;
    gates_passed: number;
    gates_failed: number;
    tests_total_passed: number;
    tests_total_failed: number;
  };
  timestamp: string;
}

/**
 * Resource definition for tests://latest
 */
export const testResultsResource = {
  uri: 'tests://latest',
  mimeType: 'application/json',
  name: 'Latest Test Results',
  description: 'Latest test and build results from all worktrees. Shows testing gate status.',
};

/**
 * Get the test results resource content
 */
export async function getTestResultsResource(): Promise<string> {
  const cwd = process.cwd();
  const worktreesDir = join(cwd, '..', 'worktrees');

  const results: WorktreeTestResults[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let gatesPassed = 0;
  let gatesFailed = 0;

  // Also check the current directory (might be in a worktree)
  const currentResults = getWorktreeResults(cwd);
  if (currentResults.tests || currentResults.build) {
    results.push(currentResults);
    totalPassed += currentResults.tests?.passed || 0;
    totalFailed += currentResults.tests?.failed || 0;
    if (currentResults.gate_passed) {
      gatesPassed++;
    } else {
      gatesFailed++;
    }
  }

  // Check worktrees directory if it exists
  if (existsSync(worktreesDir)) {
    try {
      const entries = readdirSync(worktreesDir);

      for (const entry of entries) {
        const worktreePath = join(worktreesDir, entry);
        const stat = statSync(worktreePath);

        if (stat.isDirectory()) {
          const worktreeResults = getWorktreeResults(worktreePath);
          if (worktreeResults.tests || worktreeResults.build) {
            results.push(worktreeResults);
            totalPassed += worktreeResults.tests?.passed || 0;
            totalFailed += worktreeResults.tests?.failed || 0;
            if (worktreeResults.gate_passed) {
              gatesPassed++;
            } else {
              gatesFailed++;
            }
          }
        }
      }
    } catch {
      // Ignore errors reading worktrees directory
    }
  }

  const resource: TestResultsResource = {
    worktrees: results,
    summary: {
      total_worktrees: results.length,
      gates_passed: gatesPassed,
      gates_failed: gatesFailed,
      tests_total_passed: totalPassed,
      tests_total_failed: totalFailed,
    },
    timestamp: new Date().toISOString(),
  };

  return JSON.stringify(resource, null, 2);
}

/**
 * Get test results for a specific worktree
 */
function getWorktreeResults(worktreePath: string): WorktreeTestResults {
  const resultsDir = join(worktreePath, '.smart-agent-workflow');
  const testResultsFile = join(resultsDir, 'test-results.json');
  const buildResultsFile = join(resultsDir, 'build-results.json');

  let testResults: TestResult | null = null;
  let buildResults: BuildResult | null = null;

  // Read test results
  if (existsSync(testResultsFile)) {
    try {
      const content = readFileSync(testResultsFile, 'utf-8');
      const parsed = JSON.parse(content);
      // Copy without output to reduce size
      testResults = {
        success: parsed.success,
        passed: parsed.passed,
        failed: parsed.failed,
        skipped: parsed.skipped,
        duration: parsed.duration,
        test_path: parsed.test_path,
        attempts: parsed.attempts,
        timestamp: parsed.timestamp,
      };
    } catch {
      // Invalid file
    }
  }

  // Read build results
  if (existsSync(buildResultsFile)) {
    try {
      const content = readFileSync(buildResultsFile, 'utf-8');
      const parsed = JSON.parse(content);
      // Copy without output to reduce size
      buildResults = {
        success: parsed.success,
        duration: parsed.duration,
        script: parsed.script,
        exit_code: parsed.exit_code,
        timestamp: parsed.timestamp,
        warnings: parsed.warnings || [],
        errors: parsed.errors || [],
      };
    } catch {
      // Invalid file
    }
  }

  const testsPassed = testResults?.success ?? false;
  const buildPassed = buildResults?.success ?? false;
  const gatePassed = testsPassed && buildPassed;

  // Determine last run time
  let lastRun: string | null = null;
  if (testResults?.timestamp && buildResults?.timestamp) {
    lastRun = new Date(Math.max(
      new Date(testResults.timestamp).getTime(),
      new Date(buildResults.timestamp).getTime()
    )).toISOString();
  } else if (testResults?.timestamp) {
    lastRun = testResults.timestamp;
  } else if (buildResults?.timestamp) {
    lastRun = buildResults.timestamp;
  }

  return {
    path: worktreePath,
    tests: testResults,
    build: buildResults,
    gate_passed: gatePassed,
    last_run: lastRun,
  };
}

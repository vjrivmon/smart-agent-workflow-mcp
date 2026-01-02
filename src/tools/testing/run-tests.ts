/**
 * run_e2e_tests - Run E2E tests with Playwright
 *
 * This tool runs Playwright E2E tests and enforces the testing gate.
 * Tests MUST pass before any merge operation is allowed.
 * Tracks context health (v0.6.0).
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { trackOperation } from '../../lib/context-health.js';

const execAsync = promisify(exec);

export interface RunE2ETestsParams {
  worktree_path?: string;
  test_path?: string;
  retries?: number;
  headed?: boolean;
  project?: string;
}

export interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  output: string;
  test_path: string;
  attempts: number;
  timestamp: string;
}

/**
 * Runs E2E tests using Playwright
 */
export async function runE2ETests(params: RunE2ETestsParams): Promise<TestResult> {
  const {
    worktree_path = process.cwd(),
    test_path,
    retries = 2,
    headed = false,
    project,
  } = params;

  // Track operation (tests can generate lots of output)
  await trackOperation('run_e2e_tests', 1500);

  // Validate worktree path exists
  if (!existsSync(worktree_path)) {
    throw new Error(`Worktree path does not exist: ${worktree_path}`);
  }

  // Check for playwright config
  const playwrightConfigPath = join(worktree_path, 'playwright.config.ts');
  const playwrightConfigJsPath = join(worktree_path, 'playwright.config.js');

  if (!existsSync(playwrightConfigPath) && !existsSync(playwrightConfigJsPath)) {
    throw new Error(
      'Playwright config not found. Make sure playwright.config.ts or playwright.config.js exists.'
    );
  }

  // Build the playwright command
  let command = 'npx playwright test';

  if (test_path) {
    command += ` ${test_path}`;
  }

  if (project) {
    command += ` --project="${project}"`;
  }

  if (headed) {
    command += ' --headed';
  }

  // Add JSON reporter for parsing results
  command += ' --reporter=json,list';

  let attempts = 0;
  let lastResult: TestResult | null = null;

  // Retry loop
  while (attempts <= retries) {
    attempts++;

    try {
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(command, {
        cwd: worktree_path,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 600000, // 10 minute timeout
      });

      const duration = Date.now() - startTime;
      const result = parsePlaywrightOutput(stdout, stderr);

      lastResult = {
        success: true,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        duration,
        output: stdout + stderr,
        test_path: test_path || 'all',
        attempts,
        timestamp: new Date().toISOString(),
      };

      // Save results for later retrieval
      saveTestResults(worktree_path, lastResult);

      return lastResult;
    } catch (error) {
      const duration = 0;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stderr = (error as { stderr?: string }).stderr || '';
      const stdout = (error as { stdout?: string }).stdout || '';

      const result = parsePlaywrightOutput(stdout, stderr);

      lastResult = {
        success: false,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        duration,
        output: `Error: ${errorMessage}\n${stdout}\n${stderr}`,
        test_path: test_path || 'all',
        attempts,
        timestamp: new Date().toISOString(),
      };

      // If we have retries left, continue
      if (attempts <= retries) {
        console.error(`Test attempt ${attempts} failed, retrying... (${retries - attempts + 1} retries left)`);
        continue;
      }
    }
  }

  // All retries exhausted
  if (lastResult) {
    saveTestResults(worktree_path, lastResult);
  }

  return lastResult!;
}

/**
 * Parse Playwright output to extract test counts
 */
function parsePlaywrightOutput(stdout: string, stderr: string): { passed: number; failed: number; skipped: number } {
  const output = stdout + stderr;

  // Try to parse JSON output first
  try {
    const jsonMatch = output.match(/\{[\s\S]*"stats"[\s\S]*\}/);
    if (jsonMatch) {
      const json = JSON.parse(jsonMatch[0]);
      return {
        passed: json.stats?.expected || 0,
        failed: json.stats?.unexpected || 0,
        skipped: json.stats?.skipped || 0,
      };
    }
  } catch {
    // Fall back to regex parsing
  }

  // Regex fallback for common output format
  const passedMatch = output.match(/(\d+)\s+passed/i);
  const failedMatch = output.match(/(\d+)\s+failed/i);
  const skippedMatch = output.match(/(\d+)\s+skipped/i);

  return {
    passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
    failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
    skipped: skippedMatch ? parseInt(skippedMatch[1], 10) : 0,
  };
}

/**
 * Save test results to a file for later retrieval
 */
function saveTestResults(worktreePath: string, result: TestResult): void {
  const resultsDir = join(worktreePath, '.smart-agent-workflow');
  const resultsFile = join(resultsDir, 'test-results.json');

  try {
    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }

    writeFileSync(resultsFile, JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Failed to save test results:', error);
  }
}

/**
 * Tool definition for MCP
 */
export const runE2ETestsDefinition = {
  name: 'run_e2e_tests',
  description: 'Runs E2E tests with Playwright. Tests MUST pass before merge. Supports retries and custom test paths.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      worktree_path: {
        type: 'string',
        description: 'Path to the worktree or project directory. Defaults to current directory.',
      },
      test_path: {
        type: 'string',
        description: 'Specific test file or pattern to run (e.g., "tests/e2e/login.spec.ts")',
      },
      retries: {
        type: 'number',
        description: 'Number of retries on failure. Default is 2.',
        default: 2,
      },
      headed: {
        type: 'boolean',
        description: 'Run tests in headed mode for debugging. Default is false.',
        default: false,
      },
      project: {
        type: 'string',
        description: 'Playwright project to run (e.g., "chromium", "firefox")',
      },
    },
    required: [],
  },
};

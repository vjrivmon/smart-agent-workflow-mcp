/**
 * get_test_results - Get the latest test results from a worktree
 *
 * This tool retrieves the most recent test and build results
 * to verify if the testing gate has been passed.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface GetTestResultsParams {
  worktree_path?: string;
  include_output?: boolean;
}

export interface TestResults {
  tests: TestResult | null;
  build: BuildResult | null;
  gate_passed: boolean;
  last_run: string | null;
  summary: string;
}

interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  output?: string;
  test_path: string;
  attempts: number;
  timestamp: string;
}

interface BuildResult {
  success: boolean;
  duration: number;
  output?: string;
  script: string;
  exit_code: number;
  timestamp: string;
  warnings: string[];
  errors: string[];
}

/**
 * Get the latest test results from a worktree
 */
export async function getTestResults(params: GetTestResultsParams): Promise<TestResults> {
  const {
    worktree_path = process.cwd(),
    include_output = false,
  } = params;

  // Validate worktree path exists
  if (!existsSync(worktree_path)) {
    throw new Error(`Worktree path does not exist: ${worktree_path}`);
  }

  const resultsDir = join(worktree_path, '.smart-agent-workflow');
  const testResultsFile = join(resultsDir, 'test-results.json');
  const buildResultsFile = join(resultsDir, 'build-results.json');

  let testResults: TestResult | null = null;
  let buildResults: BuildResult | null = null;

  // Read test results if they exist
  if (existsSync(testResultsFile)) {
    try {
      const content = readFileSync(testResultsFile, 'utf-8');
      testResults = JSON.parse(content);

      // Remove output if not requested (to reduce response size)
      if (!include_output && testResults) {
        delete testResults.output;
      }
    } catch (error) {
      console.error('Failed to read test results:', error);
    }
  }

  // Read build results if they exist
  if (existsSync(buildResultsFile)) {
    try {
      const content = readFileSync(buildResultsFile, 'utf-8');
      buildResults = JSON.parse(content);

      // Remove output if not requested
      if (!include_output && buildResults) {
        delete buildResults.output;
      }
    } catch (error) {
      console.error('Failed to read build results:', error);
    }
  }

  // Check if gate is passed
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

  // Generate summary
  const summary = generateSummary(testResults, buildResults, gatePassed);

  return {
    tests: testResults,
    build: buildResults,
    gate_passed: gatePassed,
    last_run: lastRun,
    summary,
  };
}

/**
 * Generate a human-readable summary
 */
function generateSummary(
  testResults: TestResult | null,
  buildResults: BuildResult | null,
  gatePassed: boolean
): string {
  const lines: string[] = [];

  if (!testResults && !buildResults) {
    return 'No test or build results found. Run tests with run_e2e_tests and build with verify_build.';
  }

  lines.push('=== Smart Agent Workflow - Testing Gate Status ===\n');

  // Gate status
  if (gatePassed) {
    lines.push('GATE STATUS: PASSED');
    lines.push('Ready for merge!');
  } else {
    lines.push('GATE STATUS: NOT PASSED');
    lines.push('Fix issues before merge.');
  }

  lines.push('');

  // Test results
  if (testResults) {
    lines.push('--- E2E Tests ---');
    lines.push(`Status: ${testResults.success ? 'PASSED' : 'FAILED'}`);
    lines.push(`Passed: ${testResults.passed} | Failed: ${testResults.failed} | Skipped: ${testResults.skipped}`);
    lines.push(`Duration: ${(testResults.duration / 1000).toFixed(2)}s`);
    lines.push(`Attempts: ${testResults.attempts}`);
    lines.push(`Last run: ${testResults.timestamp}`);
  } else {
    lines.push('--- E2E Tests ---');
    lines.push('Status: NOT RUN');
    lines.push('Run tests with run_e2e_tests tool.');
  }

  lines.push('');

  // Build results
  if (buildResults) {
    lines.push('--- Build Verification ---');
    lines.push(`Status: ${buildResults.success ? 'PASSED' : 'FAILED'}`);
    lines.push(`Script: npm run ${buildResults.script}`);
    lines.push(`Duration: ${(buildResults.duration / 1000).toFixed(2)}s`);
    lines.push(`Exit code: ${buildResults.exit_code}`);

    if (buildResults.warnings.length > 0) {
      lines.push(`Warnings: ${buildResults.warnings.length}`);
    }

    if (buildResults.errors.length > 0) {
      lines.push(`Errors: ${buildResults.errors.length}`);
      lines.push('First 3 errors:');
      buildResults.errors.slice(0, 3).forEach(err => {
        lines.push(`  - ${err.substring(0, 100)}`);
      });
    }

    lines.push(`Last run: ${buildResults.timestamp}`);
  } else {
    lines.push('--- Build Verification ---');
    lines.push('Status: NOT RUN');
    lines.push('Run build with verify_build tool.');
  }

  return lines.join('\n');
}

/**
 * Get all worktrees with their test results
 */
export async function getAllTestResults(baseDir: string): Promise<Map<string, TestResults>> {
  const results = new Map<string, TestResults>();

  // Look for worktrees directory
  const worktreesDir = join(baseDir, '..', 'worktrees');

  if (!existsSync(worktreesDir)) {
    return results;
  }

  const entries = readdirSync(worktreesDir);

  for (const entry of entries) {
    const worktreePath = join(worktreesDir, entry);
    const stat = statSync(worktreePath);

    if (stat.isDirectory()) {
      try {
        const testResults = await getTestResults({ worktree_path: worktreePath });
        results.set(worktreePath, testResults);
      } catch {
        // Skip if can't read results
      }
    }
  }

  return results;
}

/**
 * Tool definition for MCP
 */
export const getTestResultsDefinition = {
  name: 'get_test_results',
  description: 'Gets the latest test and build results from a worktree. Shows if the testing gate has been passed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      worktree_path: {
        type: 'string',
        description: 'Path to the worktree or project directory. Defaults to current directory.',
      },
      include_output: {
        type: 'boolean',
        description: 'Include full output in results. Can be large. Default is false.',
        default: false,
      },
    },
    required: [],
  },
};

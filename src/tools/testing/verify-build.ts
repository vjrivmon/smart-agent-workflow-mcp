/**
 * verify_build - Verify that the project builds successfully
 *
 * This tool runs npm build and validates the output.
 * Build MUST succeed before any merge operation is allowed.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

export interface VerifyBuildParams {
  worktree_path?: string;
  script?: string;
  timeout?: number;
}

export interface BuildResult {
  success: boolean;
  duration: number;
  output: string;
  script: string;
  exit_code: number;
  timestamp: string;
  warnings: string[];
  errors: string[];
}

/**
 * Verify that the build passes
 */
export async function verifyBuild(params: VerifyBuildParams): Promise<BuildResult> {
  const {
    worktree_path = process.cwd(),
    script = 'build',
    timeout = 300000, // 5 minutes default
  } = params;

  // Validate worktree path exists
  if (!existsSync(worktree_path)) {
    throw new Error(`Worktree path does not exist: ${worktree_path}`);
  }

  // Check for package.json
  const packageJsonPath = join(worktree_path, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error('package.json not found. Make sure you are in a Node.js project.');
  }

  // Read package.json to verify script exists
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  if (!packageJson.scripts || !packageJson.scripts[script]) {
    throw new Error(`Script "${script}" not found in package.json. Available scripts: ${Object.keys(packageJson.scripts || {}).join(', ')}`);
  }

  const command = `npm run ${script}`;
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: worktree_path,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large builds
      timeout,
    });

    const duration = Date.now() - startTime;
    const output = stdout + stderr;

    const result: BuildResult = {
      success: true,
      duration,
      output,
      script,
      exit_code: 0,
      timestamp: new Date().toISOString(),
      warnings: extractWarnings(output),
      errors: [],
    };

    // Save results for later retrieval
    saveBuildResults(worktree_path, result);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stderr = (error as { stderr?: string }).stderr || '';
    const stdout = (error as { stdout?: string }).stdout || '';
    const exitCode = (error as { code?: number }).code || 1;

    const output = `Error: ${errorMessage}\n${stdout}\n${stderr}`;

    const result: BuildResult = {
      success: false,
      duration,
      output,
      script,
      exit_code: exitCode,
      timestamp: new Date().toISOString(),
      warnings: extractWarnings(output),
      errors: extractErrors(output),
    };

    saveBuildResults(worktree_path, result);

    return result;
  }
}

/**
 * Extract warnings from build output
 */
function extractWarnings(output: string): string[] {
  const warnings: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (/warn(ing)?/i.test(line)) {
      warnings.push(line.trim());
    }
  }

  return warnings.slice(0, 50); // Limit to 50 warnings
}

/**
 * Extract errors from build output
 */
function extractErrors(output: string): string[] {
  const errors: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (/error/i.test(line) && !/warning/i.test(line)) {
      errors.push(line.trim());
    }
  }

  return errors.slice(0, 50); // Limit to 50 errors
}

/**
 * Save build results to a file for later retrieval
 */
function saveBuildResults(worktreePath: string, result: BuildResult): void {
  const resultsDir = join(worktreePath, '.smart-agent-workflow');
  const resultsFile = join(resultsDir, 'build-results.json');

  try {
    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }

    writeFileSync(resultsFile, JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Failed to save build results:', error);
  }
}

/**
 * Tool definition for MCP
 */
export const verifyBuildDefinition = {
  name: 'verify_build',
  description: 'Runs npm build and validates the output. Build MUST succeed before merge.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      worktree_path: {
        type: 'string',
        description: 'Path to the worktree or project directory. Defaults to current directory.',
      },
      script: {
        type: 'string',
        description: 'npm script to run. Default is "build".',
        default: 'build',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds. Default is 300000 (5 minutes).',
        default: 300000,
      },
    },
    required: [],
  },
};

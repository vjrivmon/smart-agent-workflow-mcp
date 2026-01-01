/**
 * Git operations wrapper for Smart Agent Workflow MCP
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorktreeInfo, WorktreeMetadata } from '../types/index.js';

const execAsync = promisify(exec);

const WORKTREE_BASE = '../worktrees';
const BRANCH_PREFIX = 'smart-agent';
const METADATA_FILE = '.smart-agent-worktree.json';

/**
 * Execute a git command and return the output
 */
export async function gitExec(command: string, cwd?: string): Promise<string> {
  const { stdout, stderr } = await execAsync(`git ${command}`, {
    cwd: cwd || process.cwd(),
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });

  if (stderr && !stderr.includes('Switched to')) {
    console.error(`[git stderr]: ${stderr}`);
  }

  return stdout.trim();
}

/**
 * Sanitize a task name for use as a branch name
 */
export function sanitizeTaskName(task: string): string {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

/**
 * Generate a unique branch name for a worktree
 */
export function generateBranchName(task: string): string {
  const sanitized = sanitizeTaskName(task);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${BRANCH_PREFIX}-${sanitized}-${timestamp}`;
}

/**
 * Get the project root (where .git is)
 */
export async function getProjectRoot(cwd?: string): Promise<string> {
  const result = await gitExec('rev-parse --show-toplevel', cwd);
  return result;
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(cwd?: string): Promise<string> {
  return gitExec('rev-parse --abbrev-ref HEAD', cwd);
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(cwd?: string): Promise<boolean> {
  const status = await gitExec('status --porcelain', cwd);
  return status.length > 0;
}

/**
 * Create an ephemeral worktree for isolated development
 */
export async function createWorktree(
  task: string,
  baseBranch: string = 'main',
  cwd?: string
): Promise<WorktreeInfo> {
  const projectRoot = await getProjectRoot(cwd);
  const branchName = generateBranchName(task);
  const worktreePath = path.join(projectRoot, WORKTREE_BASE, branchName);

  // Ensure worktrees directory exists
  await fs.mkdir(path.join(projectRoot, WORKTREE_BASE), { recursive: true });

  // Checkout base branch and pull latest
  try {
    await gitExec(`checkout ${baseBranch}`, projectRoot);
    await gitExec(`pull origin ${baseBranch}`, projectRoot).catch(() => {
      // Ignore pull errors (might not have remote)
    });
  } catch {
    // Continue even if checkout fails (might already be on base branch)
  }

  // Create the worktree with a new branch
  await gitExec(`worktree add "${worktreePath}" -b "${branchName}"`, projectRoot);

  // Create metadata file in the worktree
  const metadata: WorktreeMetadata = {
    worktree_path: worktreePath,
    branch_name: branchName,
    base_branch: baseBranch,
    created_at: new Date().toISOString(),
    task,
  };

  await fs.writeFile(
    path.join(worktreePath, METADATA_FILE),
    JSON.stringify(metadata, null, 2)
  );

  return {
    path: worktreePath,
    branch: branchName,
    baseBranch,
    createdAt: metadata.created_at,
    task,
    status: 'active',
  };
}

/**
 * List all worktrees with their metadata
 */
export async function listWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
  const projectRoot = await getProjectRoot(cwd);
  const output = await gitExec('worktree list --porcelain', projectRoot);

  const worktrees: WorktreeInfo[] = [];
  const lines = output.split('\n');

  let currentWorktree: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      currentWorktree.path = line.slice('worktree '.length);
    } else if (line.startsWith('branch refs/heads/')) {
      currentWorktree.branch = line.slice('branch refs/heads/'.length);
    } else if (line === '') {
      // End of worktree entry
      if (currentWorktree.path && currentWorktree.branch?.startsWith(BRANCH_PREFIX)) {
        // Try to read metadata file
        try {
          const metadataPath = path.join(currentWorktree.path, METADATA_FILE);
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const metadata: WorktreeMetadata = JSON.parse(metadataContent);

          worktrees.push({
            path: currentWorktree.path,
            branch: currentWorktree.branch,
            baseBranch: metadata.base_branch,
            createdAt: metadata.created_at,
            task: metadata.task,
            status: 'active',
          });
        } catch {
          // Metadata file not found, create basic info
          worktrees.push({
            path: currentWorktree.path,
            branch: currentWorktree.branch,
            baseBranch: 'unknown',
            createdAt: 'unknown',
            task: 'unknown',
            status: 'active',
          });
        }
      }
      currentWorktree = {};
    }
  }

  return worktrees;
}

/**
 * Cleanup a worktree: merge to base branch and remove
 */
export async function cleanupWorktree(
  worktreePath: string,
  force: boolean = false
): Promise<{ merged: boolean; commit?: string }> {
  // Read metadata
  const metadataPath = path.join(worktreePath, METADATA_FILE);
  const metadataContent = await fs.readFile(metadataPath, 'utf-8');
  const metadata: WorktreeMetadata = JSON.parse(metadataContent);

  const projectRoot = await getProjectRoot(worktreePath);
  const { branch_name, base_branch } = metadata;

  // Check for uncommitted changes in worktree
  if (!force && await hasUncommittedChanges(worktreePath)) {
    throw new Error('Worktree has uncommitted changes. Commit or stash them first, or use force=true.');
  }

  // Switch to base branch in main repo
  await gitExec(`checkout ${base_branch}`, projectRoot);

  // Pull latest
  await gitExec(`pull origin ${base_branch}`, projectRoot).catch(() => {});

  // Merge the worktree branch
  try {
    await gitExec(`merge ${branch_name} --no-ff -m "feat: merge ${branch_name}"`, projectRoot);
  } catch (error) {
    if (!force) {
      throw new Error(`Merge conflict detected. Resolve conflicts manually or use force=true to abort.`);
    }
    // If force, abort the merge
    await gitExec('merge --abort', projectRoot).catch(() => {});
    throw new Error('Merge failed. Worktree not cleaned up.');
  }

  // Get the merge commit hash
  const commit = await gitExec('rev-parse HEAD', projectRoot);

  // Remove the worktree
  await gitExec(`worktree remove "${worktreePath}" --force`, projectRoot);

  // Delete the branch
  await gitExec(`branch -d ${branch_name}`, projectRoot).catch(() => {
    // Force delete if needed
    return gitExec(`branch -D ${branch_name}`, projectRoot);
  });

  return { merged: true, commit };
}

/**
 * Abort a worktree without merging
 */
export async function abortWorktree(
  worktreePath: string,
  reason?: string
): Promise<void> {
  // Read metadata to get branch name
  let branchName: string;

  try {
    const metadataPath = path.join(worktreePath, METADATA_FILE);
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: WorktreeMetadata = JSON.parse(metadataContent);
    branchName = metadata.branch_name;
  } catch {
    // Try to get branch from git
    branchName = await getCurrentBranch(worktreePath);
  }

  const projectRoot = await getProjectRoot(worktreePath);

  // Switch to main in the project root first
  await gitExec('checkout main', projectRoot).catch(() => {
    return gitExec('checkout master', projectRoot);
  });

  // Remove the worktree
  await gitExec(`worktree remove "${worktreePath}" --force`, projectRoot);

  // Delete the branch
  await gitExec(`branch -D ${branchName}`, projectRoot).catch(() => {});

  if (reason) {
    console.error(`[aborted]: ${reason}`);
  }
}

/**
 * Push current branch to remote
 */
export async function pushToRemote(cwd?: string): Promise<void> {
  const branch = await getCurrentBranch(cwd);
  await gitExec(`push origin ${branch}`, cwd);
}

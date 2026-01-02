/**
 * Type definitions for Smart Agent Workflow MCP
 */

export interface WorktreeInfo {
  path: string;
  branch: string;
  baseBranch: string;
  createdAt: string;
  task: string;
  status: 'active' | 'completed' | 'aborted';
}

export interface WorktreeMetadata {
  worktree_path: string;
  branch_name: string;
  base_branch: string;
  created_at: string;
  task: string;
}

export interface CreateWorktreeResult {
  success: boolean;
  worktree: WorktreeInfo;
  message: string;
}

export interface GateStatus {
  tests_passed: boolean;
  build_passed: boolean;
  gate_passed: boolean;
  test_results: {
    success: boolean;
    passed: number;
    failed: number;
    timestamp: string;
  } | null;
  build_results: {
    success: boolean;
    exit_code: number;
    timestamp: string;
  } | null;
  message: string;
}

export interface CleanupWorktreeResult {
  success: boolean;
  merged: boolean;
  commit?: string;
  message: string;
  gate_status?: GateStatus;
}

export interface AbortWorktreeResult {
  success: boolean;
  reason?: string;
  message: string;
}

export interface WorktreeStatusResult {
  worktrees: WorktreeInfo[];
  count: number;
}

export interface GitOperationError extends Error {
  code: string;
  stderr?: string;
}

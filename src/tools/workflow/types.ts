/**
 * Workflow Types for Smart Agent Workflow MCP v0.3.0
 */

export type WorkflowPhase =
  | 'idle'
  | 'planning'
  | 'implementing'
  | 'testing'
  | 'building'
  | 'merging'
  | 'documenting'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type FeatureType = 'feature' | 'bugfix' | 'refactor' | 'docs';

export interface WorkflowStep {
  name: string;
  phase: WorkflowPhase;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  error?: string;
  output?: string;
}

export interface WorkflowState {
  id: string;
  feature_name: string;
  feature_type: FeatureType;
  description: string;
  worktree_path: string;
  branch_name: string;
  base_branch: string;
  current_phase: WorkflowPhase;
  steps: WorkflowStep[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
  error?: string;
  test_results?: {
    passed: number;
    failed: number;
    skipped: number;
  };
  build_results?: {
    success: boolean;
    duration_ms: number;
  };
}

export interface StartFeatureArgs {
  feature_name: string;
  description: string;
  type?: FeatureType;
  base_branch?: string;
}

export interface CompleteFeatureArgs {
  worktree_path: string;
  commit_message?: string;
  skip_tests?: boolean; // NOT recommended, requires force flag
}

export interface RollbackFeatureArgs {
  worktree_path: string;
  reason: string;
  keep_branch?: boolean; // Keep branch for debugging
}

export interface WorkflowResult {
  success: boolean;
  workflow_id: string;
  phase: WorkflowPhase;
  message: string;
  worktree_path?: string;
  branch_name?: string;
  error?: string;
  next_action?: string;
}

// Default workflow steps
export const DEFAULT_WORKFLOW_STEPS: Omit<WorkflowStep, 'status'>[] = [
  { name: 'Create Worktree', phase: 'planning' },
  { name: 'Setup Environment', phase: 'planning' },
  { name: 'Implement Feature', phase: 'implementing' },
  { name: 'Run E2E Tests', phase: 'testing' },
  { name: 'Verify Build', phase: 'building' },
  { name: 'Merge to Main', phase: 'merging' },
  { name: 'Update Documentation', phase: 'documenting' },
  { name: 'Cleanup Worktree', phase: 'completed' },
];

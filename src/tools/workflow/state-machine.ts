/**
 * Workflow State Machine for Smart Agent Workflow MCP v0.3.0
 *
 * Manages workflow state transitions and persistence.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  WorkflowState,
  WorkflowPhase,
  WorkflowStep,
  FeatureType,
  DEFAULT_WORKFLOW_STEPS,
} from './types.js';

const WORKFLOW_DIR = '.smart-agent-workflow';
const WORKFLOW_FILE = 'workflows.json';
const CURRENT_WORKFLOW_FILE = 'current-workflow.json';

/**
 * Valid phase transitions
 */
const PHASE_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
  idle: ['planning'],
  planning: ['implementing', 'failed'],
  implementing: ['testing', 'failed'],
  testing: ['building', 'failed'],
  building: ['merging', 'failed'],
  merging: ['documenting', 'failed'],
  documenting: ['completed', 'failed'],
  completed: ['idle'], // Can start new workflow
  failed: ['rolled_back', 'idle'], // Can rollback or restart
  rolled_back: ['idle'], // Can start new workflow
};

/**
 * Get workflow storage directory
 */
async function getWorkflowDir(cwd?: string): Promise<string> {
  const baseDir = cwd || process.cwd();
  const workflowDir = path.join(baseDir, WORKFLOW_DIR);
  await fs.mkdir(workflowDir, { recursive: true });
  return workflowDir;
}

/**
 * Create a new workflow
 */
export async function createWorkflow(
  featureName: string,
  description: string,
  featureType: FeatureType,
  worktreePath: string,
  branchName: string,
  baseBranch: string,
  cwd?: string
): Promise<WorkflowState> {
  const workflowDir = await getWorkflowDir(cwd);

  const workflow: WorkflowState = {
    id: randomUUID(),
    feature_name: featureName,
    feature_type: featureType,
    description,
    worktree_path: worktreePath,
    branch_name: branchName,
    base_branch: baseBranch,
    current_phase: 'planning',
    steps: [
      { name: 'Create Worktree', phase: 'planning', status: 'completed', completed_at: new Date().toISOString() },
      { name: 'Setup Environment', phase: 'planning', status: 'in_progress', started_at: new Date().toISOString() },
      { name: 'Implement Feature', phase: 'implementing', status: 'pending' },
      { name: 'Run E2E Tests', phase: 'testing', status: 'pending' },
      { name: 'Verify Build', phase: 'building', status: 'pending' },
      { name: 'Merge to Main', phase: 'merging', status: 'pending' },
      { name: 'Update Documentation', phase: 'documenting', status: 'pending' },
      { name: 'Cleanup Worktree', phase: 'completed', status: 'pending' },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Save as current workflow
  await fs.writeFile(
    path.join(workflowDir, CURRENT_WORKFLOW_FILE),
    JSON.stringify(workflow, null, 2)
  );

  // Append to workflows history
  const historyPath = path.join(workflowDir, WORKFLOW_FILE);
  let history: WorkflowState[] = [];
  try {
    const content = await fs.readFile(historyPath, 'utf-8');
    history = JSON.parse(content);
  } catch {
    // No history yet
  }
  history.push(workflow);
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2));

  return workflow;
}

/**
 * Get current active workflow
 */
export async function getCurrentWorkflow(cwd?: string): Promise<WorkflowState | null> {
  try {
    const workflowDir = await getWorkflowDir(cwd);
    const content = await fs.readFile(
      path.join(workflowDir, CURRENT_WORKFLOW_FILE),
      'utf-8'
    );
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get workflow by worktree path
 */
export async function getWorkflowByPath(worktreePath: string, cwd?: string): Promise<WorkflowState | null> {
  const current = await getCurrentWorkflow(cwd);
  if (current && current.worktree_path === worktreePath) {
    return current;
  }

  // Search in history
  try {
    const workflowDir = await getWorkflowDir(cwd);
    const content = await fs.readFile(
      path.join(workflowDir, WORKFLOW_FILE),
      'utf-8'
    );
    const history: WorkflowState[] = JSON.parse(content);
    return history.find((w) => w.worktree_path === worktreePath) || null;
  } catch {
    return null;
  }
}

/**
 * Transition workflow to a new phase
 */
export async function transitionPhase(
  workflowId: string,
  newPhase: WorkflowPhase,
  stepUpdate?: { stepName: string; status: 'completed' | 'failed'; output?: string; error?: string },
  cwd?: string
): Promise<WorkflowState> {
  const workflow = await getCurrentWorkflow(cwd);

  if (!workflow || workflow.id !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found or not current`);
  }

  // Validate transition
  const validTransitions = PHASE_TRANSITIONS[workflow.current_phase];
  if (!validTransitions.includes(newPhase)) {
    throw new Error(
      `Invalid phase transition: ${workflow.current_phase} → ${newPhase}. ` +
      `Valid transitions: ${validTransitions.join(', ')}`
    );
  }

  // Update phase
  workflow.current_phase = newPhase;
  workflow.updated_at = new Date().toISOString();

  // Update specific step if provided
  if (stepUpdate) {
    const step = workflow.steps.find((s) => s.name === stepUpdate.stepName);
    if (step) {
      step.status = stepUpdate.status;
      step.completed_at = new Date().toISOString();
      if (stepUpdate.output) step.output = stepUpdate.output;
      if (stepUpdate.error) step.error = stepUpdate.error;
    }

    // Start next pending step
    const nextStep = workflow.steps.find((s) => s.status === 'pending');
    if (nextStep && stepUpdate.status === 'completed') {
      nextStep.status = 'in_progress';
      nextStep.started_at = new Date().toISOString();
    }
  }

  // Mark completed if final phase
  if (newPhase === 'completed') {
    workflow.completed_at = new Date().toISOString();
  }

  // Save updated workflow
  const workflowDir = await getWorkflowDir(cwd);
  await fs.writeFile(
    path.join(workflowDir, CURRENT_WORKFLOW_FILE),
    JSON.stringify(workflow, null, 2)
  );

  // Update history
  const historyPath = path.join(workflowDir, WORKFLOW_FILE);
  try {
    const content = await fs.readFile(historyPath, 'utf-8');
    const history: WorkflowState[] = JSON.parse(content);
    const idx = history.findIndex((w) => w.id === workflowId);
    if (idx >= 0) {
      history[idx] = workflow;
      await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
    }
  } catch {
    // Ignore history errors
  }

  return workflow;
}

/**
 * Mark workflow as failed
 */
export async function failWorkflow(
  workflowId: string,
  error: string,
  failedStep: string,
  cwd?: string
): Promise<WorkflowState> {
  const workflow = await getCurrentWorkflow(cwd);

  if (!workflow || workflow.id !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  workflow.current_phase = 'failed';
  workflow.error = error;
  workflow.updated_at = new Date().toISOString();

  // Mark failed step
  const step = workflow.steps.find((s) => s.name === failedStep);
  if (step) {
    step.status = 'failed';
    step.error = error;
    step.completed_at = new Date().toISOString();
  }

  // Save
  const workflowDir = await getWorkflowDir(cwd);
  await fs.writeFile(
    path.join(workflowDir, CURRENT_WORKFLOW_FILE),
    JSON.stringify(workflow, null, 2)
  );

  return workflow;
}

/**
 * Mark workflow as rolled back
 */
export async function rollbackWorkflow(
  workflowId: string,
  reason: string,
  cwd?: string
): Promise<WorkflowState> {
  const workflow = await getCurrentWorkflow(cwd);

  if (!workflow || workflow.id !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  workflow.current_phase = 'rolled_back';
  workflow.error = `Rolled back: ${reason}`;
  workflow.updated_at = new Date().toISOString();
  workflow.completed_at = new Date().toISOString();

  // Mark all pending steps as skipped
  workflow.steps.forEach((step) => {
    if (step.status === 'pending' || step.status === 'in_progress') {
      step.status = 'skipped';
    }
  });

  // Save
  const workflowDir = await getWorkflowDir(cwd);
  await fs.writeFile(
    path.join(workflowDir, CURRENT_WORKFLOW_FILE),
    JSON.stringify(workflow, null, 2)
  );

  return workflow;
}

/**
 * Clear current workflow (after completion or rollback)
 */
export async function clearCurrentWorkflow(cwd?: string): Promise<void> {
  try {
    const workflowDir = await getWorkflowDir(cwd);
    await fs.unlink(path.join(workflowDir, CURRENT_WORKFLOW_FILE));
  } catch {
    // Already cleared
  }
}

/**
 * Get all workflows history
 */
export async function getWorkflowHistory(cwd?: string): Promise<WorkflowState[]> {
  try {
    const workflowDir = await getWorkflowDir(cwd);
    const content = await fs.readFile(
      path.join(workflowDir, WORKFLOW_FILE),
      'utf-8'
    );
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Update step progress
 */
export async function updateStep(
  workflowId: string,
  stepName: string,
  status: 'in_progress' | 'completed' | 'failed',
  details?: { output?: string; error?: string },
  cwd?: string
): Promise<WorkflowState> {
  const workflow = await getCurrentWorkflow(cwd);

  if (!workflow || workflow.id !== workflowId) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const step = workflow.steps.find((s) => s.name === stepName);
  if (!step) {
    throw new Error(`Step ${stepName} not found in workflow`);
  }

  step.status = status;
  if (status === 'in_progress') {
    step.started_at = new Date().toISOString();
  } else {
    step.completed_at = new Date().toISOString();
  }
  if (details?.output) step.output = details.output;
  if (details?.error) step.error = details.error;

  workflow.updated_at = new Date().toISOString();

  // Save
  const workflowDir = await getWorkflowDir(cwd);
  await fs.writeFile(
    path.join(workflowDir, CURRENT_WORKFLOW_FILE),
    JSON.stringify(workflow, null, 2)
  );

  return workflow;
}

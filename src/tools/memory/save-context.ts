/**
 * save_context Tool for Smart Agent Workflow MCP
 *
 * Saves the current workflow context including decisions, learnings,
 * and file changes for future reference.
 */

import { getCurrentWorkflow, getWorkflowById } from '../workflow/state-machine.js';
import type { WorkflowState } from '../workflow/types.js';
import {
  saveWorkflowContext,
  addMemoryEntries,
} from './store.js';
import type { SaveContextArgs, SaveContextResult, MemoryEntry } from './types.js';

export const saveContextDefinition = {
  name: 'save_context',
  description:
    'Save the current workflow context to memory. Captures decisions, learnings, and file changes for future sessions. Use this to persist important context before completing or rolling back a feature.',
  inputSchema: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'Workflow ID to save context for (uses current workflow if not specified)',
      },
      decisions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key decisions made during this workflow',
      },
      learnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Learnings or insights from this work',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Custom tags for categorizing this context',
      },
      notes: {
        type: 'string',
        description: 'Additional notes about this context',
      },
    },
  },
};

export async function saveContext(args: SaveContextArgs): Promise<SaveContextResult> {
  // Get the workflow to save context for
  let workflow = await getCurrentWorkflow();

  if (args.workflow_id) {
    const specified = await getWorkflowById(args.workflow_id);
    if (specified) {
      workflow = specified;
    }
  }

  if (!workflow) {
    return {
      success: false,
      workflow_id: args.workflow_id || 'unknown',
      entries_created: 0,
      context_saved: false,
      message: 'No workflow found. Start a feature first with start_feature.',
    };
  }

  const entries: Array<Omit<MemoryEntry, 'id' | 'created_at'>> = [];

  // Create entries for decisions
  if (args.decisions && args.decisions.length > 0) {
    for (const decision of args.decisions) {
      entries.push({
        type: 'decision',
        content: decision,
        workflow_id: workflow.id,
        tags: ['decision', ...(args.tags || [])],
        importance: 7,
      });
    }
  }

  // Create entries for learnings
  if (args.learnings && args.learnings.length > 0) {
    for (const learning of args.learnings) {
      entries.push({
        type: 'learning',
        content: learning,
        workflow_id: workflow.id,
        tags: ['learning', ...(args.tags || [])],
        importance: 8, // Learnings are high importance
      });
    }
  }

  // Create entry for notes
  if (args.notes) {
    entries.push({
      type: 'context',
      content: args.notes,
      workflow_id: workflow.id,
      tags: ['notes', ...(args.tags || [])],
      importance: 5,
    });
  }

  // Extract file changes from workflow history
  const filesModified = extractFilesFromHistory(workflow);
  if (filesModified.length > 0) {
    entries.push({
      type: 'file_change',
      content: `Modified files: ${filesModified.join(', ')}`,
      workflow_id: workflow.id,
      files: filesModified,
      tags: ['files', ...(args.tags || [])],
      importance: 6,
    });
  }

  // Extract errors from history
  const errors = extractErrorsFromHistory(workflow);
  for (const error of errors) {
    entries.push({
      type: 'error',
      content: error,
      workflow_id: workflow.id,
      tags: ['error', ...(args.tags || [])],
      importance: 9, // Errors are high priority to remember
    });
  }

  // Add all entries to memory
  const createdEntries = await addMemoryEntries(entries);

  // Save the workflow context
  const context = await saveWorkflowContext({
    workflow_id: workflow.id,
    feature_name: workflow.feature_name,
    description: workflow.description,
    decisions: args.decisions || [],
    files_modified: filesModified,
    learnings: args.learnings || [],
    errors,
    test_summary: extractTestSummary(workflow),
    phase: workflow.current_phase,
  });

  return {
    success: true,
    workflow_id: workflow.id,
    entries_created: createdEntries.length,
    context_saved: true,
    message: `Saved ${createdEntries.length} memory entries and context for workflow "${workflow.feature_name}"`,
  };
}

/**
 * Extract modified files from workflow steps
 */
function extractFilesFromHistory(workflow: WorkflowState): string[] {
  // For now, we don't track files in workflow steps
  // This can be extended later to track files from step outputs
  return [];
}

/**
 * Extract errors from workflow
 */
function extractErrorsFromHistory(workflow: WorkflowState): string[] {
  const errors: string[] = [];

  // Get error from workflow itself
  if (workflow.error) {
    errors.push(workflow.error);
  }

  // Get errors from failed steps
  for (const step of workflow.steps) {
    if (step.status === 'failed' && step.error) {
      errors.push(`${step.name}: ${step.error}`);
    }
  }

  return errors;
}

/**
 * Extract test summary from workflow
 */
function extractTestSummary(
  workflow: WorkflowState
): { passed: number; failed: number; skipped: number } | undefined {
  if (!workflow.test_results) return undefined;

  return {
    passed: workflow.test_results.passed || 0,
    failed: workflow.test_results.failed || 0,
    skipped: workflow.test_results.skipped || 0,
  };
}

/**
 * worktree_status tool - Lists all active worktrees with their metadata
 */

import { z } from 'zod';
import { listWorktrees } from '../../lib/git.js';
import type { WorktreeStatusResult } from '../../types/index.js';

export const worktreeStatusSchema = z.object({});

export type WorktreeStatusInput = z.infer<typeof worktreeStatusSchema>;

export async function worktreeStatus(_input: WorktreeStatusInput): Promise<WorktreeStatusResult> {
  try {
    const worktrees = await listWorktrees();

    return {
      worktrees,
      count: worktrees.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[worktree_status error]: ${message}`);
    return {
      worktrees: [],
      count: 0,
    };
  }
}

export const worktreeStatusDefinition = {
  name: 'worktree_status',
  description: 'Lists all active worktrees with their metadata',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

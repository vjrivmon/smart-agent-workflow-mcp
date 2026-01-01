/**
 * create_worktree tool - Creates an ephemeral git worktree for isolated feature development
 */

import { z } from 'zod';
import { createWorktree as gitCreateWorktree } from '../../lib/git.js';
import type { CreateWorktreeResult } from '../../types/index.js';

export const createWorktreeSchema = z.object({
  task: z.string().describe('Feature/task description'),
  base_branch: z.string().default('main').describe('Base branch to create from'),
});

export type CreateWorktreeInput = z.infer<typeof createWorktreeSchema>;

export async function createWorktree(input: CreateWorktreeInput): Promise<CreateWorktreeResult> {
  const { task, base_branch } = input;

  try {
    const worktree = await gitCreateWorktree(task, base_branch);

    return {
      success: true,
      worktree,
      message: `Created worktree at ${worktree.path} on branch ${worktree.branch}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      worktree: {
        path: '',
        branch: '',
        baseBranch: base_branch,
        createdAt: '',
        task,
        status: 'aborted',
      },
      message: `Failed to create worktree: ${message}`,
    };
  }
}

export const createWorktreeDefinition = {
  name: 'create_worktree',
  description: 'Creates an ephemeral git worktree for isolated feature development',
  inputSchema: {
    type: 'object' as const,
    properties: {
      task: {
        type: 'string',
        description: 'Feature/task description',
      },
      base_branch: {
        type: 'string',
        description: 'Base branch to create from (default: main)',
        default: 'main',
      },
    },
    required: ['task'],
  },
};

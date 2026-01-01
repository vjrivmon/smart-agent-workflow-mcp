/**
 * abort_worktree tool - Aborts worktree without merging
 */

import { z } from 'zod';
import { abortWorktree as gitAbortWorktree } from '../../lib/git.js';
import type { AbortWorktreeResult } from '../../types/index.js';

export const abortWorktreeSchema = z.object({
  worktree_path: z.string().describe('Path to worktree'),
  reason: z.string().optional().describe('Reason for abort (for logging)'),
});

export type AbortWorktreeInput = z.infer<typeof abortWorktreeSchema>;

export async function abortWorktree(input: AbortWorktreeInput): Promise<AbortWorktreeResult> {
  const { worktree_path, reason } = input;

  try {
    await gitAbortWorktree(worktree_path, reason);

    return {
      success: true,
      reason,
      message: `Worktree aborted successfully${reason ? `: ${reason}` : ''}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      reason,
      message: `Failed to abort worktree: ${message}`,
    };
  }
}

export const abortWorktreeDefinition = {
  name: 'abort_worktree',
  description: 'Aborts worktree without merging. Use when feature is cancelled.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      worktree_path: {
        type: 'string',
        description: 'Path to worktree',
      },
      reason: {
        type: 'string',
        description: 'Reason for abort (for logging)',
      },
    },
    required: ['worktree_path'],
  },
};

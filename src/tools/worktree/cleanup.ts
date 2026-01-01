/**
 * cleanup_worktree tool - Merges worktree to main and removes it
 */

import { z } from 'zod';
import { cleanupWorktree as gitCleanupWorktree } from '../../lib/git.js';
import type { CleanupWorktreeResult } from '../../types/index.js';

export const cleanupWorktreeSchema = z.object({
  worktree_path: z.string().describe('Path to worktree'),
  force: z.boolean().default(false).describe('Force cleanup even if tests failed (NOT recommended)'),
});

export type CleanupWorktreeInput = z.infer<typeof cleanupWorktreeSchema>;

export async function cleanupWorktree(input: CleanupWorktreeInput): Promise<CleanupWorktreeResult> {
  const { worktree_path, force } = input;

  try {
    const result = await gitCleanupWorktree(worktree_path, force);

    return {
      success: true,
      merged: result.merged,
      commit: result.commit,
      message: `Worktree merged and cleaned up. Commit: ${result.commit}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      merged: false,
      message: `Failed to cleanup worktree: ${message}`,
    };
  }
}

export const cleanupWorktreeDefinition = {
  name: 'cleanup_worktree',
  description: 'Merges worktree to main and removes it. REQUIRES tests to pass first.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      worktree_path: {
        type: 'string',
        description: 'Path to worktree',
      },
      force: {
        type: 'boolean',
        description: 'Force cleanup even if tests failed (NOT recommended)',
        default: false,
      },
    },
    required: ['worktree_path'],
  },
};

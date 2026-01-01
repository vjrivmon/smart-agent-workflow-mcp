/**
 * worktree://status resource - Current status of all worktrees
 */

import { listWorktrees } from '../lib/git.js';

export const worktreeStatusResource = {
  uri: 'worktree://status',
  name: 'Worktree Status',
  mimeType: 'application/json',
  description: 'Current status of all active smart-agent worktrees',
};

export async function getWorktreeStatusResource(): Promise<string> {
  try {
    const worktrees = await listWorktrees();

    const resource = {
      timestamp: new Date().toISOString(),
      count: worktrees.length,
      worktrees: worktrees.map(wt => ({
        path: wt.path,
        branch: wt.branch,
        baseBranch: wt.baseBranch,
        createdAt: wt.createdAt,
        task: wt.task,
        status: wt.status,
      })),
    };

    return JSON.stringify(resource, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      count: 0,
      worktrees: [],
      error: message,
    }, null, 2);
  }
}

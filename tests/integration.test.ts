/**
 * Integration tests for Smart Agent Workflow MCP v0.3.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';

// Import functions to test
import { createWorktree, listWorktrees, abortWorktree } from '../src/lib/git.js';
import { createWorkflow, getCurrentWorkflow, transitionPhase, getWorkflowHistory } from '../src/tools/workflow/state-machine.js';

const TEST_DIR = '/tmp/smart-agent-test-' + Date.now();
const TEST_REPO = path.join(TEST_DIR, 'test-repo');

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Create a test git repository
    await fs.mkdir(TEST_DIR, { recursive: true });
    execSync(`git init ${TEST_REPO}`);
    execSync(`cd ${TEST_REPO} && git config user.email "test@test.com" && git config user.name "Test"`);
    execSync(`cd ${TEST_REPO} && echo "# Test" > README.md && git add . && git commit -m "init"`);
    
    // Create package.json for build tests
    await fs.writeFile(path.join(TEST_REPO, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      scripts: { build: 'echo "build ok"' }
    }));
    execSync(`cd ${TEST_REPO} && git add . && git commit -m "add package.json"`);
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('Worktree Management', () => {
    it('should list worktrees (initially just main)', async () => {
      const worktrees = await listWorktrees(TEST_REPO);
      // Main worktree is not listed as it's not a smart-agent worktree
      expect(Array.isArray(worktrees)).toBe(true);
    });
  });

  describe('Workflow State Machine', () => {
    it('should create a workflow', async () => {
      const workflow = await createWorkflow(
        'test-feature',
        'Test feature description',
        'feature',
        '/tmp/test-worktree',
        'smart-agent-test-feature',
        'main',
        TEST_REPO
      );

      expect(workflow).toBeDefined();
      expect(workflow.id).toBeDefined();
      expect(workflow.feature_name).toBe('test-feature');
      expect(workflow.current_phase).toBe('planning');
      expect(workflow.steps.length).toBe(8);
    });

    it('should get current workflow', async () => {
      const current = await getCurrentWorkflow(TEST_REPO);
      
      expect(current).toBeDefined();
      expect(current?.feature_name).toBe('test-feature');
    });

    it('should transition phases correctly', async () => {
      const current = await getCurrentWorkflow(TEST_REPO);
      expect(current).toBeDefined();
      
      // planning -> implementing
      const updated = await transitionPhase(current!.id, 'implementing', undefined, TEST_REPO);
      expect(updated.current_phase).toBe('implementing');
    });

    it('should reject invalid transitions', async () => {
      const current = await getCurrentWorkflow(TEST_REPO);
      expect(current).toBeDefined();
      
      // implementing -> completed (invalid, should go through testing, building, etc.)
      await expect(
        transitionPhase(current!.id, 'completed', undefined, TEST_REPO)
      ).rejects.toThrow('Invalid phase transition');
    });

    it('should get workflow history', async () => {
      const history = await getWorkflowHistory(TEST_REPO);
      
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });
  });
});

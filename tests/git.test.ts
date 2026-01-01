import { describe, it, expect } from 'vitest';
import { sanitizeTaskName, generateBranchName } from '../src/lib/git.js';

describe('Git utilities', () => {
  describe('sanitizeTaskName', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeTaskName('Add Feature')).toBe('add-feature');
    });

    it('should replace special characters with hyphens', () => {
      expect(sanitizeTaskName('Fix bug #123!')).toBe('fix-bug-123');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(sanitizeTaskName('--test--')).toBe('test');
    });

    it('should truncate to 30 characters', () => {
      const longTask = 'This is a very long task description that exceeds thirty characters';
      expect(sanitizeTaskName(longTask).length).toBeLessThanOrEqual(30);
    });
  });

  describe('generateBranchName', () => {
    it('should start with smart-agent prefix', () => {
      const branchName = generateBranchName('test task');
      expect(branchName).toMatch(/^smart-agent-/);
    });

    it('should include sanitized task name', () => {
      const branchName = generateBranchName('Add Feature');
      expect(branchName).toContain('add-feature');
    });

    it('should include timestamp', () => {
      const branchName = generateBranchName('test');
      // Should have a timestamp-like pattern at the end
      expect(branchName).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });
  });
});

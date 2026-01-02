/**
 * generate_completion_report Tool - Smart Agent Workflow MCP v0.4.0
 *
 * Generates a markdown report for a completed workflow.
 * Includes test results, timing, git diff summary, and more.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectRoot, gitExec } from '../../lib/git.js';
import { getCurrentWorkflow, getWorkflowById, getWorkflowHistory } from '../workflow/state-machine.js';
import type { GenerateReportArgs, GenerateReportResult, CompletionReport } from './types.js';

export const generateCompletionReportDefinition = {
  name: 'generate_completion_report',
  description:
    'Generates a detailed markdown report for a completed feature workflow. ' +
    'Includes test results, build status, timing, and git changes summary. ' +
    'Reports are saved to .smart-agent-workflow/reports/',
  inputSchema: {
    type: 'object' as const,
    properties: {
      workflow_id: {
        type: 'string',
        description: 'Workflow ID to generate report for. Default: current or most recent',
      },
      output_path: {
        type: 'string',
        description: 'Custom output path for the report. Default: .smart-agent-workflow/reports/',
      },
      include_tests: {
        type: 'boolean',
        default: true,
        description: 'Include detailed test results in the report',
      },
      include_diff: {
        type: 'boolean',
        default: true,
        description: 'Include git diff summary (files changed, insertions, deletions)',
      },
      include_timing: {
        type: 'boolean',
        default: true,
        description: 'Include timing information (total duration, per-phase timing)',
      },
    },
    required: [],
  },
};

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get git diff stats between two commits
 */
async function getGitDiffStats(
  baseBranch: string,
  branchName: string,
  cwd?: string
): Promise<{ files: number; insertions: number; deletions: number }> {
  try {
    const projectRoot = await getProjectRoot(cwd);
    const output = await gitExec(`diff --shortstat ${baseBranch}...${branchName}`, projectRoot);

    // Parse: " 5 files changed, 120 insertions(+), 30 deletions(-)"
    const filesMatch = output.match(/(\d+) files? changed/);
    const insertionsMatch = output.match(/(\d+) insertions?\(\+\)/);
    const deletionsMatch = output.match(/(\d+) deletions?\(-\)/);

    return {
      files: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      insertions: insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0,
      deletions: deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0,
    };
  } catch {
    return { files: 0, insertions: 0, deletions: 0 };
  }
}

/**
 * Generate markdown content from report
 */
function generateMarkdown(report: CompletionReport, options: GenerateReportArgs): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Feature Completion Report`);
  lines.push('');
  lines.push(`**Feature:** ${report.feature_name}`);
  lines.push(`**Type:** ${report.feature_type}`);
  lines.push(`**Status:** ${getStatusEmoji(report.status)} ${report.status.toUpperCase()}`);
  lines.push('');

  // Description
  lines.push(`## Description`);
  lines.push('');
  lines.push(report.description);
  lines.push('');

  // Timing
  if (options.include_timing !== false) {
    lines.push(`## Timing`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Started | ${formatDate(report.created_at)} |`);
    lines.push(`| Completed | ${formatDate(report.completed_at)} |`);
    lines.push(`| Duration | ${report.duration_human} |`);
    lines.push('');
  }

  // Phases
  lines.push(`## Workflow Phases`);
  lines.push('');
  for (const phase of report.phases_completed) {
    lines.push(`- ✅ ${phase}`);
  }
  lines.push('');

  // Test Results
  if (options.include_tests !== false && report.test_results) {
    lines.push(`## Test Results`);
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| ✅ Passed | ${report.test_results.passed} |`);
    lines.push(`| ❌ Failed | ${report.test_results.failed} |`);
    lines.push(`| ⏭️ Skipped | ${report.test_results.skipped} |`);
    lines.push('');
  }

  // Build Results
  if (report.build_results) {
    lines.push(`## Build Results`);
    lines.push('');
    lines.push(`- **Status:** ${report.build_results.success ? '✅ Success' : '❌ Failed'}`);
    if (report.build_results.duration_ms) {
      lines.push(`- **Duration:** ${formatDuration(report.build_results.duration_ms)}`);
    }
    lines.push('');
  }

  // Git Stats
  if (options.include_diff !== false && (report.files_changed || report.insertions || report.deletions)) {
    lines.push(`## Code Changes`);
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Files Changed | ${report.files_changed || 0} |`);
    lines.push(`| Insertions | +${report.insertions || 0} |`);
    lines.push(`| Deletions | -${report.deletions || 0} |`);
    if (report.commit_hash) {
      lines.push(`| Commit | \`${report.commit_hash.slice(0, 7)}\` |`);
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Generated by Smart Agent Workflow MCP v0.4.0*`);
  lines.push(`*Report ID: ${report.workflow_id}*`);

  return lines.join('\n');
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    case 'rolled_back':
      return '⏪';
    default:
      return '❓';
  }
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

export async function generateCompletionReport(
  args: GenerateReportArgs
): Promise<GenerateReportResult> {
  const { workflow_id, output_path, include_tests = true, include_diff = true, include_timing = true } = args;

  try {
    // Get workflow
    let workflow = workflow_id
      ? await getWorkflowById(workflow_id)
      : await getCurrentWorkflow();

    // If no current, get most recent from history
    if (!workflow) {
      const history = await getWorkflowHistory();
      if (history.length > 0) {
        workflow = history[history.length - 1];
      }
    }

    if (!workflow) {
      return {
        success: false,
        report: {} as CompletionReport,
        markdown: '',
        message: 'No workflow found to generate report for',
        error: 'No workflow found',
      };
    }

    // Calculate duration
    const startTime = new Date(workflow.created_at).getTime();
    const endTime = workflow.completed_at
      ? new Date(workflow.completed_at).getTime()
      : Date.now();
    const durationMs = endTime - startTime;

    // Get git diff stats if available
    let diffStats = { files: 0, insertions: 0, deletions: 0 };
    if (include_diff && workflow.base_branch && workflow.branch_name) {
      diffStats = await getGitDiffStats(workflow.base_branch, workflow.branch_name);
    }

    // Build report
    const report: CompletionReport = {
      workflow_id: workflow.id,
      feature_name: workflow.feature_name,
      feature_type: workflow.feature_type,
      description: workflow.description,
      status: workflow.current_phase as 'completed' | 'failed' | 'rolled_back',
      duration_ms: durationMs,
      duration_human: formatDuration(durationMs),
      phases_completed: workflow.steps
        .filter((s) => s.status === 'completed')
        .map((s) => s.name),
      test_results: workflow.test_results,
      build_results: workflow.build_results,
      files_changed: diffStats.files,
      insertions: diffStats.insertions,
      deletions: diffStats.deletions,
      commit_hash: undefined, // Could be extracted from git log
      created_at: workflow.created_at,
      completed_at: workflow.completed_at || new Date().toISOString(),
    };

    // Generate markdown
    const markdown = generateMarkdown(report, { include_tests, include_diff, include_timing });

    // Save report if output_path provided or to default location
    let savedPath: string | undefined;
    try {
      const projectRoot = await getProjectRoot();
      const reportsDir = output_path || path.join(projectRoot, '.smart-agent-workflow', 'reports');

      await fs.mkdir(reportsDir, { recursive: true });

      const filename = `${workflow.feature_name}-${workflow.id.slice(0, 8)}.md`;
      savedPath = path.join(reportsDir, filename);

      await fs.writeFile(savedPath, markdown);
    } catch {
      // Could not save, but still return the report
    }

    return {
      success: true,
      report,
      output_path: savedPath,
      markdown,
      message: savedPath
        ? `Report generated and saved to: ${savedPath}`
        : 'Report generated (not saved)',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      report: {} as CompletionReport,
      markdown: '',
      message: `Failed to generate report: ${message}`,
      error: message,
    };
  }
}

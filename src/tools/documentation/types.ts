/**
 * Types for Documentation Tools - Smart Agent Workflow MCP v0.4.0
 */

export interface UpdateDocumentationArgs {
  /** Path to the documentation file to update (default: CLAUDE.md or README.md) */
  doc_path?: string;
  /** Workflow ID to extract info from (default: current workflow) */
  workflow_id?: string;
  /** Section to update (auto-detected if not specified) */
  section?: string;
  /** Content to add/update */
  content?: string;
  /** Whether to append or replace the section */
  mode?: 'append' | 'replace' | 'prepend';
}

export interface UpdateDocumentationResult {
  success: boolean;
  doc_path: string;
  section_updated: string;
  lines_added: number;
  message: string;
  error?: string;
}

export interface GenerateReportArgs {
  /** Workflow ID to generate report for (default: current workflow) */
  workflow_id?: string;
  /** Output path for the report (default: .smart-agent-workflow/reports/) */
  output_path?: string;
  /** Include detailed test results */
  include_tests?: boolean;
  /** Include git diff summary */
  include_diff?: boolean;
  /** Include time tracking */
  include_timing?: boolean;
}

export interface CompletionReport {
  workflow_id: string;
  feature_name: string;
  feature_type: string;
  description: string;
  status: 'completed' | 'failed' | 'rolled_back';
  duration_ms: number;
  duration_human: string;
  phases_completed: string[];
  test_results?: {
    passed: number;
    failed: number;
    skipped: number;
  };
  build_results?: {
    success: boolean;
    duration_ms: number;
  };
  files_changed?: number;
  insertions?: number;
  deletions?: number;
  commit_hash?: string;
  created_at: string;
  completed_at: string;
}

export interface GenerateReportResult {
  success: boolean;
  report: CompletionReport;
  output_path?: string;
  markdown: string;
  message: string;
  error?: string;
}

export interface SyncChangelogArgs {
  /** Path to CHANGELOG.md (default: ./CHANGELOG.md) */
  changelog_path?: string;
  /** Version to add entry for (default: auto from package.json) */
  version?: string;
  /** Category: added, changed, fixed, removed, deprecated, security */
  category?: 'added' | 'changed' | 'fixed' | 'removed' | 'deprecated' | 'security';
  /** Entry text (default: auto from workflow) */
  entry?: string;
  /** Workflow ID to extract info from */
  workflow_id?: string;
}

export interface SyncChangelogResult {
  success: boolean;
  changelog_path: string;
  version: string;
  category: string;
  entry_added: string;
  message: string;
  error?: string;
}

export interface ProjectDocsInfo {
  has_readme: boolean;
  has_claude_md: boolean;
  has_changelog: boolean;
  has_contributing: boolean;
  readme_sections?: string[];
  claude_md_sections?: string[];
  last_updated?: string;
  documentation_score: number; // 0-100
  suggestions: string[];
}

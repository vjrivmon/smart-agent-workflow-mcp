/**
 * Documentation Tools - Smart Agent Workflow MCP v0.4.0
 */

export {
  updateDocumentation,
  updateDocumentationDefinition,
} from './update-documentation.js';

export {
  generateCompletionReport,
  generateCompletionReportDefinition,
} from './generate-report.js';

export {
  syncChangelog,
  syncChangelogDefinition,
} from './sync-changelog.js';

export type {
  UpdateDocumentationArgs,
  UpdateDocumentationResult,
  GenerateReportArgs,
  GenerateReportResult,
  CompletionReport,
  SyncChangelogArgs,
  SyncChangelogResult,
  ProjectDocsInfo,
} from './types.js';

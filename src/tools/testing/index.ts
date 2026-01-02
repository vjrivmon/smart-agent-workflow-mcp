/**
 * Testing Tools
 *
 * Export all testing-related tools for the Smart Agent Workflow MCP.
 * These tools enforce the testing gate before merge.
 */

export {
  runE2ETests,
  runE2ETestsDefinition,
  type RunE2ETestsParams,
  type TestResult,
} from './run-tests.js';

export {
  verifyBuild,
  verifyBuildDefinition,
  type VerifyBuildParams,
  type BuildResult,
} from './verify-build.js';

export {
  generateTestTemplate,
  generateTestTemplateDefinition,
  type GenerateTestTemplateParams,
  type GenerateTemplateResult,
} from './generate-template.js';

export {
  getTestResults,
  getTestResultsDefinition,
  getAllTestResults,
  type GetTestResultsParams,
  type TestResults,
} from './get-results.js';

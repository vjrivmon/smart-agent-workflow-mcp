/**
 * Memory Tools for Smart Agent Workflow MCP
 *
 * Provides persistent memory across sessions:
 * - save_context: Save workflow context, decisions, and learnings
 * - restore_context: Restore context from previous workflows
 * - get_memory: Query the knowledge graph
 */

export { saveContext, saveContextDefinition } from './save-context.js';
export { restoreContext, restoreContextDefinition } from './restore-context.js';
export { getMemory, getMemoryDefinition } from './get-memory.js';

// Export store functions for resource access
export {
  loadMemoryStore,
  getMemoryStats,
  searchMemory,
} from './store.js';

// Export types
export type {
  MemoryEntry,
  WorkflowContext,
  MemoryStore,
  SaveContextArgs,
  SaveContextResult,
  RestoreContextArgs,
  RestoreContextResult,
  GetMemoryArgs,
  GetMemoryResult,
} from './types.js';

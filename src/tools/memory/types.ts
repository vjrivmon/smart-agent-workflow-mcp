/**
 * Memory Persistence Types for Smart Agent Workflow MCP
 *
 * The memory system stores workflow context, decisions, and learnings
 * that persist across sessions for continuous knowledge accumulation.
 */

/**
 * A single memory entry representing a piece of knowledge
 */
export interface MemoryEntry {
  /** Unique identifier for this memory */
  id: string;
  /** Type of memory: decision, learning, context, file_change */
  type: 'decision' | 'learning' | 'context' | 'file_change' | 'error' | 'success';
  /** The content of the memory */
  content: string;
  /** Related workflow ID (if any) */
  workflow_id?: string;
  /** Related file paths (if any) */
  files?: string[];
  /** Tags for categorization and search */
  tags: string[];
  /** When this memory was created */
  created_at: string;
  /** Importance score (1-10) for prioritization */
  importance: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Context snapshot from a workflow
 */
export interface WorkflowContext {
  /** Workflow ID this context belongs to */
  workflow_id: string;
  /** Feature name */
  feature_name: string;
  /** Description of what was being done */
  description: string;
  /** Decisions made during the workflow */
  decisions: string[];
  /** Files that were modified */
  files_modified: string[];
  /** Learnings from this workflow */
  learnings: string[];
  /** Any errors encountered */
  errors: string[];
  /** Test results summary */
  test_summary?: {
    passed: number;
    failed: number;
    skipped: number;
  };
  /** When the context was saved */
  saved_at: string;
  /** Phase when context was saved */
  phase: string;
}

/**
 * Arguments for save_context tool
 */
export interface SaveContextArgs {
  /** Workflow ID to save context for (uses current if not specified) */
  workflow_id?: string;
  /** Key decisions made */
  decisions?: string[];
  /** Learnings from this work */
  learnings?: string[];
  /** Custom tags for this context */
  tags?: string[];
  /** Additional notes */
  notes?: string;
}

/**
 * Arguments for restore_context tool
 */
export interface RestoreContextArgs {
  /** Workflow ID to restore (restores most recent if not specified) */
  workflow_id?: string;
  /** Feature name to search for */
  feature_name?: string;
  /** Include related memories */
  include_related?: boolean;
  /** Maximum number of related memories to include */
  limit?: number;
}

/**
 * Arguments for get_memory tool
 */
export interface GetMemoryArgs {
  /** Search query */
  query?: string;
  /** Filter by memory type */
  type?: 'decision' | 'learning' | 'context' | 'file_change' | 'error' | 'success';
  /** Filter by tags */
  tags?: string[];
  /** Filter by workflow ID */
  workflow_id?: string;
  /** Filter by file path */
  file_path?: string;
  /** Maximum results to return */
  limit?: number;
  /** Minimum importance score (1-10) */
  min_importance?: number;
}

/**
 * The complete memory store
 */
export interface MemoryStore {
  /** Version for future migrations */
  version: string;
  /** All memory entries */
  entries: MemoryEntry[];
  /** Saved workflow contexts */
  contexts: WorkflowContext[];
  /** Last updated timestamp */
  updated_at: string;
  /** Statistics */
  stats: {
    total_entries: number;
    total_contexts: number;
    by_type: Record<string, number>;
  };
}

/**
 * Result from save_context
 */
export interface SaveContextResult {
  success: boolean;
  workflow_id: string;
  entries_created: number;
  context_saved: boolean;
  message: string;
}

/**
 * Result from restore_context
 */
export interface RestoreContextResult {
  success: boolean;
  context?: WorkflowContext;
  related_memories: MemoryEntry[];
  message: string;
}

/**
 * Result from get_memory
 */
export interface GetMemoryResult {
  success: boolean;
  entries: MemoryEntry[];
  total_matches: number;
  message: string;
}

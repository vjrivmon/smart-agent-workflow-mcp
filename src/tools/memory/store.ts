/**
 * Memory Store Management for Smart Agent Workflow MCP
 *
 * Handles persistence of memory entries and workflow contexts.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectRoot } from '../../lib/git.js';
import type { MemoryStore, MemoryEntry, WorkflowContext } from './types.js';

const MEMORY_DIR = '.smart-agent';
const MEMORY_FILE = 'memory.json';
const CURRENT_VERSION = '1.0.0';

/**
 * Get the memory directory path
 */
export async function getMemoryDir(cwd?: string): Promise<string> {
  const projectRoot = await getProjectRoot(cwd);
  return path.join(projectRoot, MEMORY_DIR);
}

/**
 * Get the memory file path
 */
export async function getMemoryFilePath(cwd?: string): Promise<string> {
  const memoryDir = await getMemoryDir(cwd);
  return path.join(memoryDir, MEMORY_FILE);
}

/**
 * Initialize an empty memory store
 */
function createEmptyStore(): MemoryStore {
  return {
    version: CURRENT_VERSION,
    entries: [],
    contexts: [],
    updated_at: new Date().toISOString(),
    stats: {
      total_entries: 0,
      total_contexts: 0,
      by_type: {},
    },
  };
}

/**
 * Load the memory store from disk
 */
export async function loadMemoryStore(cwd?: string): Promise<MemoryStore> {
  const memoryPath = await getMemoryFilePath(cwd);

  try {
    const content = await fs.readFile(memoryPath, 'utf-8');
    const store: MemoryStore = JSON.parse(content);

    // Ensure all required fields exist (migration/validation for partial files)
    if (!store.entries) store.entries = [];
    if (!store.contexts) store.contexts = [];
    if (!store.stats) {
      store.stats = {
        total_entries: 0,
        total_contexts: 0,
        by_type: {},
      };
    }
    if (!store.version) store.version = CURRENT_VERSION;
    if (!store.updated_at) store.updated_at = new Date().toISOString();

    return store;
  } catch {
    // File doesn't exist or is invalid, return empty store
    return createEmptyStore();
  }
}

/**
 * Save the memory store to disk
 */
export async function saveMemoryStore(store: MemoryStore, cwd?: string): Promise<void> {
  const memoryDir = await getMemoryDir(cwd);
  const memoryPath = await getMemoryFilePath(cwd);

  // Ensure directory exists
  await fs.mkdir(memoryDir, { recursive: true });

  // Update stats
  store.stats.total_entries = store.entries.length;
  store.stats.total_contexts = store.contexts.length;
  store.stats.by_type = store.entries.reduce(
    (acc, entry) => {
      acc[entry.type] = (acc[entry.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  store.updated_at = new Date().toISOString();

  await fs.writeFile(memoryPath, JSON.stringify(store, null, 2));
}

/**
 * Generate a unique ID for a memory entry
 */
export function generateEntryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `mem_${timestamp}_${random}`;
}

/**
 * Add a memory entry to the store
 */
export async function addMemoryEntry(
  entry: Omit<MemoryEntry, 'id' | 'created_at'>,
  cwd?: string
): Promise<MemoryEntry> {
  const store = await loadMemoryStore(cwd);

  const fullEntry: MemoryEntry = {
    ...entry,
    id: generateEntryId(),
    created_at: new Date().toISOString(),
  };

  store.entries.push(fullEntry);
  await saveMemoryStore(store, cwd);

  return fullEntry;
}

/**
 * Add multiple memory entries at once
 */
export async function addMemoryEntries(
  entries: Array<Omit<MemoryEntry, 'id' | 'created_at'>>,
  cwd?: string
): Promise<MemoryEntry[]> {
  const store = await loadMemoryStore(cwd);
  const now = new Date().toISOString();

  const fullEntries: MemoryEntry[] = entries.map((entry) => ({
    ...entry,
    id: generateEntryId(),
    created_at: now,
  }));

  store.entries.push(...fullEntries);
  await saveMemoryStore(store, cwd);

  return fullEntries;
}

/**
 * Save a workflow context
 */
export async function saveWorkflowContext(
  context: Omit<WorkflowContext, 'saved_at'>,
  cwd?: string
): Promise<WorkflowContext> {
  const store = await loadMemoryStore(cwd);

  const fullContext: WorkflowContext = {
    ...context,
    saved_at: new Date().toISOString(),
  };

  // Check if context for this workflow already exists
  const existingIndex = store.contexts.findIndex((c) => c.workflow_id === context.workflow_id);
  if (existingIndex >= 0) {
    // Update existing context
    store.contexts[existingIndex] = fullContext;
  } else {
    // Add new context
    store.contexts.push(fullContext);
  }

  await saveMemoryStore(store, cwd);

  return fullContext;
}

/**
 * Get a workflow context by ID
 */
export async function getWorkflowContext(
  workflowId: string,
  cwd?: string
): Promise<WorkflowContext | null> {
  const store = await loadMemoryStore(cwd);
  return store.contexts.find((c) => c.workflow_id === workflowId) || null;
}

/**
 * Get the most recent workflow context
 */
export async function getMostRecentContext(cwd?: string): Promise<WorkflowContext | null> {
  const store = await loadMemoryStore(cwd);

  if (store.contexts.length === 0) {
    return null;
  }

  // Sort by saved_at descending
  const sorted = [...store.contexts].sort(
    (a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
  );

  return sorted[0];
}

/**
 * Search memory entries
 */
export async function searchMemory(
  options: {
    query?: string;
    type?: MemoryEntry['type'];
    tags?: string[];
    workflow_id?: string;
    file_path?: string;
    min_importance?: number;
    limit?: number;
  },
  cwd?: string
): Promise<MemoryEntry[]> {
  const store = await loadMemoryStore(cwd);
  let results = [...store.entries];

  // Filter by type
  if (options.type) {
    results = results.filter((e) => e.type === options.type);
  }

  // Filter by workflow_id
  if (options.workflow_id) {
    results = results.filter((e) => e.workflow_id === options.workflow_id);
  }

  // Filter by tags (any match)
  if (options.tags && options.tags.length > 0) {
    results = results.filter((e) => options.tags!.some((tag) => e.tags.includes(tag)));
  }

  // Filter by file_path
  if (options.file_path) {
    results = results.filter((e) => e.files?.some((f) => f.includes(options.file_path!)));
  }

  // Filter by min_importance
  if (options.min_importance) {
    results = results.filter((e) => e.importance >= options.min_importance!);
  }

  // Filter by query (search in content)
  if (options.query) {
    const queryLower = options.query.toLowerCase();
    results = results.filter(
      (e) =>
        e.content.toLowerCase().includes(queryLower) ||
        e.tags.some((t) => t.toLowerCase().includes(queryLower))
    );
  }

  // Sort by importance and recency
  results.sort((a, b) => {
    // First by importance (descending)
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    // Then by date (descending)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Limit results
  if (options.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}

/**
 * Find context by feature name (fuzzy match)
 */
export async function findContextByFeature(
  featureName: string,
  cwd?: string
): Promise<WorkflowContext | null> {
  const store = await loadMemoryStore(cwd);
  const nameLower = featureName.toLowerCase();

  // Exact match first
  const exact = store.contexts.find((c) => c.feature_name.toLowerCase() === nameLower);
  if (exact) return exact;

  // Partial match
  const partial = store.contexts.find((c) => c.feature_name.toLowerCase().includes(nameLower));
  if (partial) return partial;

  // Search in description
  return (
    store.contexts.find((c) => c.description?.toLowerCase().includes(nameLower)) || null
  );
}

/**
 * Get memory statistics
 */
export async function getMemoryStats(cwd?: string): Promise<MemoryStore['stats'] & { contexts_list: string[] }> {
  const store = await loadMemoryStore(cwd);

  return {
    ...store.stats,
    contexts_list: store.contexts.map((c) => `${c.workflow_id}: ${c.feature_name}`),
  };
}

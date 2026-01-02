/**
 * Types for Context Tools - Smart Agent Workflow MCP v0.6.0
 */

// ============= checkpoint_context =============

export interface CheckpointContextArgs {
  /** Optional message to include with checkpoint */
  message?: string;
  /** Tags to categorize this checkpoint */
  tags?: string[];
  /** Force checkpoint even if health is good */
  force?: boolean;
}

export interface CheckpointContextResult {
  success: boolean;
  /** Number of memory entries saved */
  entries_saved: number;
  /** Health score before checkpoint */
  health_before: number;
  /** Health score after checkpoint (reset to 100) */
  health_after: number;
  /** Human-readable message */
  message: string;
  /** Error message if failed */
  error?: string;
}

// ============= get_context_health =============

export interface GetContextHealthArgs {
  /** Include detailed operation log */
  include_log?: boolean;
}

export interface GetContextHealthResult {
  /** Current health score (0-100) */
  health_score: number;
  /** Health status: good (>=50), warning (30-49), critical (<30) */
  health_status: 'good' | 'warning' | 'critical';
  /** Number of MCP operations this session */
  operations_count: number;
  /** Estimated tokens used */
  estimated_tokens: number;
  /** Session duration in minutes */
  session_minutes: number;
  /** Whether checkpoint is recommended */
  should_checkpoint: boolean;
  /** Timestamp of last checkpoint */
  last_checkpoint: string | null;
  /** Human-readable message */
  message: string;
  /** Recent operations (if include_log=true) */
  recent_operations?: Array<{
    type: string;
    tokens: number;
    timestamp: string;
  }>;
}

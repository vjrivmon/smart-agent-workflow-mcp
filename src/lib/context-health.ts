/**
 * Context Health Tracker for Smart Agent Workflow MCP v0.6.0
 *
 * Tracks MCP activity as a proxy for context window usage.
 * Uses heuristics to estimate "health" and trigger auto-checkpoints
 * before context is lost to compaction.
 *
 * Since Claude Code doesn't expose context window APIs to MCPs,
 * we use activity-based heuristics:
 * - Number of operations
 * - Estimated tokens (based on input/output size)
 * - Session duration
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectRoot } from './git.js';

// Weights for health calculation
const OPS_WEIGHT = 0.5; // Each 10 ops = -5 points
const TOKENS_WEIGHT = 0.001; // Each 1000 tokens = -1 point
const TIME_WEIGHT = 0.5; // Each 10 minutes = -5 points

// Thresholds
const CHECKPOINT_THRESHOLD = 30; // Auto-checkpoint when health < 30
const WARNING_THRESHOLD = 50; // Warn when health < 50

// File for persisting session state
const SESSION_FILE = '.smart-agent/session.json';

export interface ContextHealth {
  /** Number of MCP operations this session */
  operations_count: number;
  /** Estimated tokens used (based on input/output sizes) */
  estimated_tokens: number;
  /** Session start timestamp */
  session_start: string;
  /** Last checkpoint timestamp */
  last_checkpoint: string | null;
  /** Current health score (0-100) */
  health_score: number;
  /** Health status: 'good' | 'warning' | 'critical' */
  health_status: 'good' | 'warning' | 'critical';
  /** Whether a checkpoint is recommended */
  should_checkpoint: boolean;
  /** Human-readable message */
  message: string;
}

interface SessionState {
  session_id: string;
  session_start: string;
  operations_count: number;
  estimated_tokens: number;
  last_checkpoint: string | null;
  operations_log: Array<{
    type: string;
    tokens: number;
    timestamp: string;
  }>;
}

// In-memory session state (persisted to disk)
let currentSession: SessionState | null = null;

/**
 * Get the session file path
 */
async function getSessionFilePath(cwd?: string): Promise<string> {
  const projectRoot = await getProjectRoot(cwd);
  return path.join(projectRoot, SESSION_FILE);
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session_${timestamp}_${random}`;
}

/**
 * Initialize or load session state
 */
async function ensureSession(cwd?: string): Promise<SessionState> {
  if (currentSession) {
    return currentSession;
  }

  const sessionPath = await getSessionFilePath(cwd);

  try {
    const content = await fs.readFile(sessionPath, 'utf-8');
    const saved: SessionState = JSON.parse(content);

    // Check if session is from today (reset daily)
    const sessionDate = new Date(saved.session_start).toDateString();
    const today = new Date().toDateString();

    if (sessionDate === today) {
      currentSession = saved;
      return currentSession;
    }
  } catch {
    // File doesn't exist or is invalid
  }

  // Create new session
  currentSession = {
    session_id: generateSessionId(),
    session_start: new Date().toISOString(),
    operations_count: 0,
    estimated_tokens: 0,
    last_checkpoint: null,
    operations_log: [],
  };

  await saveSession(cwd);
  return currentSession;
}

/**
 * Save session state to disk
 */
async function saveSession(cwd?: string): Promise<void> {
  if (!currentSession) return;

  const sessionPath = await getSessionFilePath(cwd);
  const dir = path.dirname(sessionPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(sessionPath, JSON.stringify(currentSession, null, 2));
}

/**
 * Calculate health score based on current metrics
 */
function calculateHealthScore(session: SessionState): number {
  const now = new Date();
  const start = new Date(session.session_start);
  const minutes = (now.getTime() - start.getTime()) / (1000 * 60);

  // Calculate decay from each factor
  const opsDecay = (session.operations_count / 10) * OPS_WEIGHT * 10;
  const tokensDecay = (session.estimated_tokens / 1000) * TOKENS_WEIGHT * 1000;
  const timeDecay = (minutes / 10) * TIME_WEIGHT * 10;

  // Calculate health (clamped to 0-100)
  const health = Math.max(0, Math.min(100, 100 - opsDecay - tokensDecay - timeDecay));

  return Math.round(health);
}

/**
 * Get health status from score
 */
function getHealthStatus(score: number): 'good' | 'warning' | 'critical' {
  if (score >= WARNING_THRESHOLD) return 'good';
  if (score >= CHECKPOINT_THRESHOLD) return 'warning';
  return 'critical';
}

/**
 * Generate human-readable message
 */
function generateMessage(score: number, status: string, shouldCheckpoint: boolean): string {
  if (shouldCheckpoint) {
    return `Context health critical (${score}%). Auto-checkpoint recommended.`;
  }
  if (status === 'warning') {
    return `Context health declining (${score}%). Consider saving context soon.`;
  }
  return `Context health good (${score}%).`;
}

/**
 * Track an MCP operation
 *
 * @param type - Type of operation (e.g., 'start_feature', 'run_tests')
 * @param tokensEstimate - Estimated tokens for this operation
 * @param cwd - Working directory
 */
export async function trackOperation(
  type: string,
  tokensEstimate: number = 500,
  cwd?: string
): Promise<void> {
  const session = await ensureSession(cwd);

  session.operations_count++;
  session.estimated_tokens += tokensEstimate;
  session.operations_log.push({
    type,
    tokens: tokensEstimate,
    timestamp: new Date().toISOString(),
  });

  // Keep only last 100 operations in log
  if (session.operations_log.length > 100) {
    session.operations_log = session.operations_log.slice(-100);
  }

  await saveSession(cwd);
}

/**
 * Get current health score
 */
export async function getHealthScore(cwd?: string): Promise<number> {
  const session = await ensureSession(cwd);
  return calculateHealthScore(session);
}

/**
 * Check if a checkpoint is recommended
 */
export async function shouldCheckpoint(cwd?: string): Promise<boolean> {
  const score = await getHealthScore(cwd);
  return score < CHECKPOINT_THRESHOLD;
}

/**
 * Get full health metrics
 */
export async function getMetrics(cwd?: string): Promise<ContextHealth> {
  const session = await ensureSession(cwd);
  const score = calculateHealthScore(session);
  const status = getHealthStatus(score);
  const checkpoint = score < CHECKPOINT_THRESHOLD;

  return {
    operations_count: session.operations_count,
    estimated_tokens: session.estimated_tokens,
    session_start: session.session_start,
    last_checkpoint: session.last_checkpoint,
    health_score: score,
    health_status: status,
    should_checkpoint: checkpoint,
    message: generateMessage(score, status, checkpoint),
  };
}

/**
 * Mark that a checkpoint was performed
 */
export async function markCheckpoint(cwd?: string): Promise<void> {
  const session = await ensureSession(cwd);
  session.last_checkpoint = new Date().toISOString();
  await saveSession(cwd);
}

/**
 * Reset session (after checkpoint or manually)
 */
export async function resetSession(cwd?: string): Promise<void> {
  currentSession = {
    session_id: generateSessionId(),
    session_start: new Date().toISOString(),
    operations_count: 0,
    estimated_tokens: 0,
    last_checkpoint: new Date().toISOString(),
    operations_log: [],
  };

  await saveSession(cwd);
}

/**
 * Get session duration in minutes
 */
export async function getSessionMinutes(cwd?: string): Promise<number> {
  const session = await ensureSession(cwd);
  const now = new Date();
  const start = new Date(session.session_start);
  return Math.round((now.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * statusline://workflow Resource - Smart Agent Workflow MCP v0.6.0
 *
 * Provides workflow progress and context health for statusline display.
 * Format: Phase: testing | Feature: auth | Progress: 4/8 | Health: 75%
 */

import { getCurrentWorkflow } from '../tools/workflow/state-machine.js';
import { getMetrics } from '../lib/context-health.js';

export interface StatuslineData {
  /** Current phase: planning, implementing, testing, etc. */
  phase: string;
  /** Progress as "completed/total" */
  progress: string;
  /** Progress percentage */
  percent: number;
  /** Feature name (truncated to 20 chars) */
  feature: string;
  /** Context health score (0-100) */
  health: number;
  /** Health status: good, warning, critical */
  health_status: 'good' | 'warning' | 'critical';
  /** Current action message */
  message: string;
  /** Whether checkpoint is recommended */
  should_checkpoint: boolean;
  /** Pre-formatted statusline string */
  formatted: string;
  /** Short format for limited space */
  short: string;
  /** Icon representation */
  icon: string;
}

export const statuslineWorkflowResource = {
  uri: 'statusline://workflow',
  name: 'Statusline Workflow',
  description: 'Workflow progress and context health for statusline display',
  mimeType: 'application/json',
};

export async function getStatuslineWorkflowResource(): Promise<string> {
  const workflow = await getCurrentWorkflow();
  const health = await getMetrics();

  // Get health icon
  const healthIcon = getHealthIcon(health.health_status);
  const phaseIcon = getPhaseIcon(workflow?.current_phase || 'idle');

  if (!workflow) {
    const data: StatuslineData = {
      phase: 'idle',
      progress: '0/0',
      percent: 0,
      feature: '-',
      health: health.health_score,
      health_status: health.health_status,
      message: 'No active workflow',
      should_checkpoint: health.should_checkpoint,
      formatted: `${phaseIcon} idle | ${healthIcon} Health: ${health.health_score}%`,
      short: `idle | H:${health.health_score}%`,
      icon: phaseIcon,
    };

    return JSON.stringify(data, null, 2);
  }

  // Calculate progress
  const completedSteps = workflow.steps.filter((s) => s.status === 'completed').length;
  const totalSteps = workflow.steps.length;
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Truncate feature name
  const featureName = truncate(workflow.feature_name, 20);

  // Get current action message
  const currentStep = workflow.steps.find((s) => s.status === 'in_progress');
  const message = currentStep?.name || getPhaseMessage(workflow.current_phase);

  // Build formatted strings
  const formatted = buildFormatted({
    phase: workflow.current_phase,
    feature: featureName,
    completed: completedSteps,
    total: totalSteps,
    percent,
    health: health.health_score,
    healthStatus: health.health_status,
    phaseIcon,
    healthIcon,
  });

  const short = buildShort({
    phase: workflow.current_phase,
    percent,
    health: health.health_score,
  });

  const data: StatuslineData = {
    phase: workflow.current_phase,
    progress: `${completedSteps}/${totalSteps}`,
    percent,
    feature: featureName,
    health: health.health_score,
    health_status: health.health_status,
    message,
    should_checkpoint: health.should_checkpoint,
    formatted,
    short,
    icon: phaseIcon,
  };

  return JSON.stringify(data, null, 2);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function getPhaseIcon(phase: string): string {
  const icons: Record<string, string> = {
    planning: '📋',
    implementing: '🔨',
    testing: '🧪',
    building: '🏗️',
    merging: '🔀',
    documenting: '📝',
    completed: '✅',
    failed: '❌',
    rolled_back: '↩️',
    idle: '💤',
  };
  return icons[phase] || '⚙️';
}

function getHealthIcon(status: 'good' | 'warning' | 'critical'): string {
  const icons: Record<string, string> = {
    good: '💚',
    warning: '💛',
    critical: '❤️',
  };
  return icons[status];
}

function getPhaseMessage(phase: string): string {
  const messages: Record<string, string> = {
    planning: 'Planning feature...',
    implementing: 'Implementing...',
    testing: 'Running tests...',
    building: 'Building project...',
    merging: 'Merging changes...',
    documenting: 'Updating docs...',
    completed: 'Completed!',
    failed: 'Failed - check errors',
    rolled_back: 'Rolled back',
    idle: 'Idle',
  };
  return messages[phase] || 'Working...';
}

interface FormatParams {
  phase: string;
  feature: string;
  completed: number;
  total: number;
  percent: number;
  health: number;
  healthStatus: 'good' | 'warning' | 'critical';
  phaseIcon: string;
  healthIcon: string;
}

function buildFormatted(params: FormatParams): string {
  const {
    phase,
    feature,
    completed,
    total,
    percent,
    health,
    phaseIcon,
    healthIcon,
  } = params;

  // Format: 📋 Phase: planning | Feature: auth | Progress: 4/8 (50%) | 💚 Health: 75%
  return (
    `${phaseIcon} Phase: ${phase} | ` +
    `Feature: ${feature} | ` +
    `Progress: ${completed}/${total} (${percent}%) | ` +
    `${healthIcon} Health: ${health}%`
  );
}

interface ShortParams {
  phase: string;
  percent: number;
  health: number;
}

function buildShort(params: ShortParams): string {
  const { phase, percent, health } = params;
  // Format: testing 50% | H:75%
  return `${phase} ${percent}% | H:${health}%`;
}

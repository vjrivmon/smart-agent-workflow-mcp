#!/bin/bash
# Smart Agent Workflow - Statusline Script v0.6.0
#
# This script provides workflow status for Claude Code statusline.
# It reads from the statusline://workflow MCP resource.
#
# Usage:
#   claude config set -g statusLine '{"type":"command","command":"npx smart-agent-workflow-mcp --statusline"}'
#
# Output format (DETAILED):
#   Phase: testing | Feature: auth | Progress: 4/8 | Health: 75%

set -euo pipefail

# Get the directory of the current project
PROJECT_DIR="${PWD}"

# Session file path
SESSION_FILE="${PROJECT_DIR}/.smart-agent/session.json"
WORKFLOW_FILE="${PROJECT_DIR}/.smart-agent/workflow.json"

# Default output when no workflow is active
default_output() {
    echo "idle | Health: 100%"
}

# Check if files exist
if [[ ! -f "$SESSION_FILE" ]]; then
    default_output
    exit 0
fi

# Read session data
if ! SESSION_DATA=$(cat "$SESSION_FILE" 2>/dev/null); then
    default_output
    exit 0
fi

# Parse health from session
HEALTH=$(echo "$SESSION_DATA" | grep -oP '"health_score"\s*:\s*\K\d+' 2>/dev/null || echo "100")
OPS=$(echo "$SESSION_DATA" | grep -oP '"operations_count"\s*:\s*\K\d+' 2>/dev/null || echo "0")

# Determine health status icon
if [[ "$HEALTH" -ge 50 ]]; then
    HEALTH_ICON="+"
elif [[ "$HEALTH" -ge 30 ]]; then
    HEALTH_ICON="~"
else
    HEALTH_ICON="!"
fi

# Check if workflow exists
if [[ -f "$WORKFLOW_FILE" ]]; then
    WORKFLOW_DATA=$(cat "$WORKFLOW_FILE" 2>/dev/null)

    if [[ -n "$WORKFLOW_DATA" ]]; then
        # Parse workflow data
        PHASE=$(echo "$WORKFLOW_DATA" | grep -oP '"current_phase"\s*:\s*"\K[^"]+' 2>/dev/null || echo "idle")
        FEATURE=$(echo "$WORKFLOW_DATA" | grep -oP '"feature_name"\s*:\s*"\K[^"]+' 2>/dev/null || echo "-")

        # Truncate feature name to 15 chars
        if [[ ${#FEATURE} -gt 15 ]]; then
            FEATURE="${FEATURE:0:12}..."
        fi

        # Count steps (simplified - counts "completed" occurrences)
        COMPLETED=$(echo "$WORKFLOW_DATA" | grep -o '"status":"completed"' | wc -l 2>/dev/null || echo "0")
        TOTAL=$(echo "$WORKFLOW_DATA" | grep -o '"status":' | wc -l 2>/dev/null || echo "0")

        # Calculate percentage
        if [[ "$TOTAL" -gt 0 ]]; then
            PERCENT=$((COMPLETED * 100 / TOTAL))
        else
            PERCENT=0
        fi

        # Build output (DETAILED format as user requested)
        echo "Phase: ${PHASE} | Feature: ${FEATURE} | Progress: ${COMPLETED}/${TOTAL} (${PERCENT}%) | ${HEALTH_ICON} Health: ${HEALTH}%"
    else
        echo "idle | ${HEALTH_ICON} Health: ${HEALTH}%"
    fi
else
    echo "idle | ${HEALTH_ICON} Health: ${HEALTH}%"
fi

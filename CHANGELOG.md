# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-01-02

### Added

- **Context Health Tracking**: Anticipate context window compaction with heuristics-based health scoring
- **Tools**: `checkpoint_context`, `get_context_health` for manual and automatic checkpointing
- **Resource**: `statusline://workflow` - Workflow progress and health for Claude Code statusline
- **Script**: `bin/statusline.sh` for Claude Code statusline integration
- Auto-checkpoint when health drops below 30% with user-visible message
- Health score formula: `100 - (ops*0.5 + tokens*0.001 + time*0.5)`
- Session persistence in `.smart-agent/session.json`

### Changed

- All workflow tools now track operations for health scoring
- `complete_feature` and `rollback_feature` trigger auto-checkpoint if health is critical
- `start_feature` resets session health for new workflows

## [0.5.0] - 2026-01-02

### Added

- **Memory persistence**: `save_context`, `restore_context`, `get_memory` tools
- **Resource**: `memory://knowledge` - Knowledge graph overview with insights
- Auto-save context on `complete_feature` (learnings, test results, build info)
- Auto-save context on `rollback_feature` (rollback reason, phase at rollback)
- Memory entries with importance scoring (1-10) for prioritization
- Fuzzy search by feature name in `restore_context`
- Memory statistics and insights generation

### Changed

- Workflow completion now automatically persists context to memory
- Rollback now records error context for future learning

## [0.4.1] - 2026-01-02

### Fixed

- Fixed branch not being deleted after worktree removal in `abortWorktree`
- Added `getMainRepoRoot` function to properly resolve worktree to main repo path

## [0.4.0] - 2026-01-02

### Added

- **Documentation tools**: `update_documentation`, `generate_completion_report`, `sync_changelog`
- **Resource**: `docs://project` - Project documentation overview with score and suggestions
- Automatic CHANGELOG.md generation following Keep a Changelog format

## [0.3.1] - 2026-01-02

### Fixed

- Fixed `abortWorktree` failing when main repo already had main/master checked out
- Removed unnecessary checkout step before worktree removal

## [0.3.0] - 2026-01-02

### Added

- **Workflow orchestration**: `start_feature`, `complete_feature`, `rollback_feature`, `get_workflow_status`
- **Resource**: `workflow://current` - Current workflow status with progress bar
- State machine with 8 phases: idle → planning → implementing → testing → building → merging → documenting → completed
- Automatic workflow state persistence
- Integration tests for workflow state machine

## [0.2.0] - 2026-01-01

### Added

- **Testing gates**: `run_e2e_tests`, `verify_build`, `generate_test_template`, `get_test_results`
- **Resource**: `tests://latest` - Latest test results
- Playwright E2E test execution and reporting
- Build verification before merge
- Test template generation for new features

## [0.1.0] - 2026-01-01

### Added

- **Worktree management**: `create_worktree`, `worktree_status`, `cleanup_worktree`, `abort_worktree`
- **Resource**: `worktree://status` - Active worktrees overview
- Ephemeral git worktrees for isolated development
- Automatic branch naming with timestamps
- Worktree metadata persistence

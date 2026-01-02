# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

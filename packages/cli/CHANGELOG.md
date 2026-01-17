# Changelog

All notable changes to AgileFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.90.6] - 2026-01-17

### Changed
- Static TUI dashboard (no bouncing)

## [2.90.5] - 2026-01-17

### Added
- Restore static dashboard command

## [2.90.4] - 2026-01-17

### Fixed
- Fix TUI to use simple-tui by default

## [2.90.2] - 2026-01-17

### Fixed
- TUI CLI command fix

## [2.90.1] - 2026-01-16

### Added
- TUI as CLI command with session fixes

## [2.90.0] - 2026-01-16

### Added
- TUI dashboard with session management and modular CLI architecture

## [2.89.3] - 2026-01-14

### Added
- Security hardening with shell injection prevention and secret redaction

## [2.89.2] - 2026-01-14

### Fixed
- Increase precompact preservation window to 10 minutes

## [2.89.1] - 2026-01-14

### Fixed
- Fix active_commands preservation after conversation compact

## [2.89.0] - 2026-01-14

### Added
- Security hardening, LRU file caching, and comprehensive test coverage

## [2.88.0] - 2026-01-13

### Fixed
- Security and code quality improvements from EP-0012 ideation

## [2.87.0] - 2026-01-13

### Added
- Multi-session visibility with cleanup notifications and status line indicators

## [2.86.0] - 2026-01-13

### Added
- Progressive disclosure and RPI workflow for context optimization

## [2.85.0] - 2026-01-12

### Added
- Parallel sessions with git worktrees and session boundary protection

## [2.84.2] - 2026-01-11

### Fixed
- Auto-update retry with npm cache clean on stale registry

## [2.84.1] - 2026-01-11

### Fixed
- Status line and welcome table formatting fixes

## [2.84.0] - 2026-01-11

### Added
- File awareness, smart merge, and simplified auto-update

## [2.83.0] - 2026-01-10

### Changed
- Remove beta TUI dashboard - use slash commands instead

## [2.82.5] - 2026-01-10

### Fixed
- Fix version detection to read from config.yaml

## [2.82.4] - 2026-01-10

### Fixed
- Fix whats-new command to include CHANGELOG.md in installation

## [2.82.3] - 2026-01-09

### Fixed
- Copy lib directory to .agileflow for script dependencies

## [2.82.2] - 2026-01-09

### Fixed
- Installer now copies lib/ directory to .agileflow/lib/ for script dependencies

## [2.82.1] - 2026-01-09

### Fixed
- Fix npm package missing lib directory

## [2.82.0] - 2026-01-09

### Added
- Multi-agent orchestration patterns with batch, workflow, and choose commands

## [2.81.0] - 2026-01-09

### Added
- Input validation, damage control refactor, and session merge flow

## [2.80.0] - 2026-01-09

### Added
- Comprehensive documentation and docs site improvements

## [2.79.0] - 2026-01-09

### Added
- Damage Control protection, Visual Mode, and self-improving skills

## [2.78.0] - 2026-01-08

### Added
- Enhanced compact context preservation with damage control hooks

## [2.77.0] - 2026-01-01

### Added
- Vibrant 256-color palette with enhanced status line

## [2.76.0] - 2026-01-01

### Added
- Ralph Loop autonomous story processing with Stop hook support

## [2.75.0] - 2026-01-01

### Added
- Restructure context/research commands into subdirectories with stuck detection

## [2.74.0] - 2025-12-31

### Added
- Script repair and diagnostics for /configure command

## [2.73.0] - 2025-12-29

### Changed
- Consolidate scripts in .agileflow/scripts with updated hook paths

## [2.72.0] - 2025-12-29

### Added
- Move scripts to .agileflow/scripts directory

## [2.71.0] - 2025-12-29

### Added
- Outdated script detection with upgrade command and 30-day archival default

## [2.70.0] - 2025-12-29

### Fixed
- Configure script reads version dynamically from installed package

## [2.69.0] - 2025-12-29

### Added
- Fix configure script to read version dynamically instead of hardcoded

## [2.68.0] - 2025-12-29

### Fixed
- Remove Stop hook, simplify docs to npx-only installation

## [2.67.0] - 2025-12-29

### Added
- Simplify installation to npx-only, remove global install recommendation

## [2.66.0] - 2025-12-29

### Added
- Remove unreliable Stop hook, improve global CLI messaging

## [2.65.0] - 2025-12-29

### Added
- Improved outdated global CLI messaging and guidance

## [2.64.0] - 2025-12-29

### Changed
- Fix version detection in welcome script for user projects

## [2.63.0] - 2025-12-27

### Added
- Per-IDE options for update and uninstall commands

## [2.62.0] - 2025-12-27

### Added
- Dynamic skill generation with research-driven MCP integration

## [2.61.0] - 2025-12-27

### Fixed
- Fixed changelog entry formatting and version comparison links

## [2.60.0] - 2025-12-27

### Changed
- Standardized changelog format with human-readable summaries

## [2.59.0] - 2025-12-27

### Changed
- Automated CHANGELOG.md updates in release script

## [2.58.0] - 2025-12-27

### Added
- Auto-update configuration via `/agileflow:configure --enable=autoupdate`

### Fixed
- Metadata merge for nested `updates` object in configure script

## [2.57.0] - 2025-12-27

### Added
- Auto-update system with configurable check frequency
- Update notifications in welcome message and status line
- Changelog display after updates showing what's new
- `/agileflow:whats-new` command for viewing full changelog

## [2.56.0] - 2025-12-27

### Added
- Dynamic IDE discovery with auto-detection from handlers
- OpenAI Codex CLI now appears in setup IDE selection

### Changed
- Replaced hardcoded IDE list with dynamic loading from IdeManager

## [2.55.0] - 2025-12-26

### Changed
- Consolidated code improvements and debugging enhancements

## [2.54.0] - 2025-12-26

### Added
- Test suites for generators, npm-utils, and version-checker

## [2.53.0] - 2025-12-25

### Added
- Session manager for parallel session detection
- Warning when multiple Claude sessions active

## [2.52.0] - 2025-12-24

### Added
- PreCompact hook for context preservation during compacts

## [2.51.0] - 2025-12-23

### Added
- OpenAI Codex CLI integration

## [2.50.0] - 2025-12-22

### Added
- Windsurf and Cursor IDE support

## [2.45.0] - 2025-12-20

### Added
- Auto-archival system for completed stories

## [2.40.0] - 2025-12-18

### Added
- Hooks system for event-driven automation
- Status line integration for Claude Code

[Unreleased]: https://github.com/projectquestorg/AgileFlow/compare/v2.60.0...HEAD
[2.60.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.59.0...v2.60.0
[2.59.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.58.0...v2.59.0
[2.58.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.57.0...v2.58.0
[2.57.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.56.0...v2.57.0
[2.56.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.55.0...v2.56.0
[2.55.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.54.0...v2.55.0
[2.54.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.53.0...v2.54.0
[2.53.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.52.0...v2.53.0
[2.52.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.51.0...v2.52.0
[2.51.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.50.0...v2.51.0
[2.50.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.45.0...v2.50.0
[2.45.0]: https://github.com/projectquestorg/AgileFlow/compare/v2.40.0...v2.45.0
[2.40.0]: https://github.com/projectquestorg/AgileFlow/releases/tag/v2.40.0

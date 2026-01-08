# Changelog

All notable changes to AgileFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

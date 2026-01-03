# Change Log Ai Docify

## [0.2.0]

### Added

- **Per-Function Documentation**: A "lightbulb" Code Action now appears on `def` lines to generate documentation for a single function.
- **Status Bar Integration**: A new item in the status bar shows the active AI provider and displays a spinner during operations.
- **CLI Version Check**: The extension now verifies the `ai-docify` CLI version to ensure feature compatibility.

### Changed

- The editor update logic is now more robust, ensuring changes are applied correctly even if the file is not in focus.

### Fixed

- Resolved `npm install` dependency conflicts by updating package versions.

## [0.1.4]

- Improved user feedback during documentation generation by consolidating progress notifications into a single, continuous display. This resolves an issue where loading feedback would not always display reliably.

## [0.1.3]

- Fixed a bug that caused the progress UI to dismiss prematurely before generation was complete.

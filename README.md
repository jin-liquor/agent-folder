# Agent Folder

[简体中文](README.zh-CN.md)

Agent Folder is a lightweight Windows desktop app for organizing frequently used folders and opening them quickly in a code editor or File Explorer.

## Features

- Pin favorite folders and sort by recent usage
- Fuzzy search by folder name, path, and tags
- Browse the directory tree or scan configured roots for projects
- Open folders with VS Code, VS Code Insiders, Cursor, Windsurf, or File Explorer
- Launch Codex CLI or Claude Code in the selected folder with configurable permission modes
- Add tags and colors; identify common project types
- Stay in the system tray, use global shortcuts, and open the quick-launch palette
- Import and export local JSON data; history is capped at 500 records while favorites are preserved
- Storage safety: a damaged `data.json` is backed up before anything else happens, and a read-only protection mode prevents silent overwrites when the backup itself fails
- Per-hotkey registration status in settings, with a retry button, so a shortcut conflict is visible instead of failing silently
- Atomic, rollback-safe export and merge-on-import that reports the exact number of records added, trimmed, and skipped

## Current Version

The latest release is **v1.0.0**. See [Release Notes](#release-notes) for the changes in this version.

## Installation

Download the latest `*_x64-setup.exe` from [GitHub Releases](https://github.com/jin-liquor/agent-folder/releases) and run the installer.

Requirements: Windows 10 or later and the Microsoft Edge WebView2 Runtime (usually preinstalled on Windows 11). Launch the installed app from the Start menu. Avoid running a built executable directly from a working directory with a low-integrity security label, as Windows may block system-tray icon registration.

## Quick Start

1. Launch Agent Folder.
2. Choose **Add Folder** to browse, or use **Disk Scan** to search for a project.
3. Select a project and press `Enter` to open it with the current default editor.
4. Favorite frequently used folders and search them later from the main window or quick-launch palette.

If a project is outside the default scan roots, add its parent directory in **Settings → Scan Roots**. Adding records, favorites, or settings never moves, modifies, or deletes project files on disk.

## Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Focus search |
| `↑` / `↓` | Move through results |
| `Enter` | Open the selected project |
| `Ctrl+D` | Toggle favorite |
| `Delete` | Remove a record without deleting its folder |
| `Ctrl+,` | Open settings |
| `Esc` | Close a panel or clear search |
| `Ctrl+Alt+V` | Show or hide the main window; configurable in settings |
| `Ctrl+Shift+Space` | Show or hide the quick-launch palette |

The title-bar minimize button hides the app to the tray. The close button follows the **Minimize to tray on close** setting. To exit completely, right-click the tray icon and choose **Quit**.

## Privacy and Data

Folder records and settings are stored locally at `%APPDATA%\agent-folder\data.json`. The app does not upload this data or collect usage analytics. JSON import and export are user-initiated. Automatic updates are not currently included; download and install new versions manually from GitHub Releases.

If `data.json` cannot be parsed, the app backs up the original file next to it before falling back, and settings shows the backup path together with **Reveal backup**, **Export backup**, **Restore backup**, and **Reload** actions. If creating the backup fails, the app enters read-only protection instead of overwriting your data.

## Release Notes

### v1.0.0

- Launch Codex CLI and Claude Code directly in the selected folder, with configurable permission modes.
- Move disk-scan controls into Settings and enforce the scan toggle in both frontend and backend.
- Prioritize favorites and previously opened folders in search results, then append unsaved scan matches.
- Clear the search query after opening a folder or launching a CLI agent.
- Synchronize the application, Tauri, installer, and documentation version to 1.0.0.

### v0.1.1

- Distinguish first launch, read failure, and JSON corruption when loading storage; back up a damaged file before falling back, and enter read-only protection if the backup fails.
- Add a schema version with migrations, plus a storage warning banner that shows the backup path and recovery actions.
- Separate the editor-launch result from the history-write result, so an opened folder is never reported as a failed open; a failed history save rolls back in-memory state.
- Show the real registration status of the main-window and quick-launch hotkeys separately, with the failure reason and a retry button.
- Make export atomic with temporary-file replacement and rollback; report import results using the counts actually retained after capacity trimming.
- Stop disabling the VS Code workspace-trust prompt by default for new installs, while preserving previously saved preferences.

### v0.1.0

- First public release.

## Build from Source

Requires Node.js, pnpm, the Rust toolchain, and the Windows WebView2 Runtime.

```powershell
pnpm install
pnpm build
pnpm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --release --offline
$env:CI = "true"
pnpm tauri build
```

The installer is generated in `src-tauri/target/release/bundle/nsis/`.

## Developer Documentation

Development rules, architecture notes, release notes, and implementation plans are maintained in the local `AGENT.md` and `Plan/` directory. They are intentionally excluded from Git tracking.

## License

[MIT License](LICENSE)

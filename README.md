# Agent Folder

[简体中文](README.zh-CN.md)

Agent Folder is a lightweight Windows desktop app for organizing frequently used folders and opening them quickly in a code editor or File Explorer.

## Features

- Pin favorite folders and sort by recent usage
- Fuzzy search by folder name, path, and tags
- Browse the directory tree or scan configured roots for projects
- Open folders with VS Code, VS Code Insiders, Cursor, Windsurf, or File Explorer
- Add tags and colors; identify common project types
- Stay in the system tray, use global shortcuts, and open the quick-launch palette
- Import and export local JSON data; history is capped at 500 records while favorites are preserved

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

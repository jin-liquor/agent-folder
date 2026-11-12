//! CLI 可执行文件探测。
//!
//! 目标是把「用户敲的命令名」解析成**真实可执行文件**的绝对路径，供
//! [`super::editor::open_cli_agent`] 直接 `CreateProcess`，从而避开
//! `cmd.exe` 的引号与元字符问题。
//!
//! 探测顺序按「确定性从高到低」排列：
//!
//! 1. 用户在设置里手动填写的覆盖值；
//! 2. 官方安装脚本的默认位置（最高优先级，不受 PATH 影响）；
//! 3. `where.exe` 的输出（可能是 `.cmd` shim，需要继续解析）；
//! 4. 各家包管理器的全局目录；
//! 5. 逐项扫描 PATH。
//!
//! 实测背景：omp 的可执行文件位于 `%LOCALAPPDATA%\omp`，该目录**在**用户
//! PATH 里，但 `cmd /c omp` 依然解析不到；因此不能只依赖 `where.exe`。

use std::path::{Path, PathBuf};
use std::process::Command;

/// 支持的 CLI 种类。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CliAgent {
    Codex,
    Claude,
    Omp,
    Opencode,
}

impl CliAgent {
    /// 用于设置字段名、日志与错误文案的稳定标识。
    pub const fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::Omp => "omp",
            Self::Opencode => "opencode",
        }
    }

    /// 展示名（错误提示用）。
    pub const fn label(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::Claude => "Claude Code",
            Self::Omp => "omp",
            Self::Opencode => "opencode",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "codex" => Some(Self::Codex),
            "claude" => Some(Self::Claude),
            "omp" => Some(Self::Omp),
            "opencode" => Some(Self::Opencode),
            _ => None,
        }
    }

    pub const ALL: [Self; 4] = [Self::Codex, Self::Claude, Self::Omp, Self::Opencode];
}

/// 探测结果：真实可执行文件，或只能退回 shim。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolved {
    /// 真实可执行文件，可直接 CreateProcess。
    Exe(PathBuf),
    /// 只找到 `.cmd`/`.bat` shim，必须经 `cmd.exe` 启动。
    Shim(PathBuf),
    /// 未找到。
    Missing,
}

impl Resolved {
    pub fn is_available(&self) -> bool {
        !matches!(self, Self::Missing)
    }

    /// 探测缓存里要保存的路径文本；`Missing` 存空串。
    pub fn path_text(&self) -> String {
        match self {
            Self::Exe(path) | Self::Shim(path) => path.to_string_lossy().into_owned(),
            Self::Missing => String::new(),
        }
    }
}

/// 读一个环境变量并拼出子路径；变量缺失时返回 `None`。
fn env_join(var: &str, rest: &[&str]) -> Option<PathBuf> {
    let base = std::env::var_os(var)?;
    let mut path = PathBuf::from(base);
    for part in rest {
        path.push(part);
    }
    Some(path)
}

/// 各 CLI 的显式候选路径（按优先级）。
///
/// 全部使用环境变量拼接，不含任何机器相关的硬编码绝对路径。
fn candidates(agent: CliAgent) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    match agent {
        CliAgent::Omp => {
            // 官方 install.ps1 的默认落点。
            out.extend(env_join("LOCALAPPDATA", &["omp", "omp.exe"]));
            out.extend(env_join("USERPROFILE", &[".bun", "bin", "omp.exe"]));
            out.extend(env_join("APPDATA", &["npm", "omp.cmd"]));
            out.extend(env_join(
                "LOCALAPPDATA",
                &["Microsoft", "WinGet", "Links", "omp.exe"],
            ));
            out.extend(env_join("USERPROFILE", &[".local", "bin", "omp.exe"]));
        }
        CliAgent::Opencode => {
            // npm 全局：package.json 的 bin 直接指向真实 exe。
            out.extend(env_join(
                "APPDATA",
                &[
                    "npm",
                    "node_modules",
                    "@opencode",
                    "cli",
                    "bin",
                    "opencode.exe",
                ],
            ));
            out.extend(env_join("LOCALAPPDATA", &["opencode", "opencode.exe"]));
            out.extend(env_join(
                "USERPROFILE",
                &[".opencode", "bin", "opencode.exe"],
            ));
            // 桌面版自带，仅作兜底（版本可能落后于 npm 全局）。
            out.extend(env_join(
                "LOCALAPPDATA",
                &[
                    "Programs",
                    "ai.opencode.desktop",
                    "resources",
                    "opencode-cli.exe",
                ],
            ));
            out.extend(env_join("APPDATA", &["npm", "opencode.cmd"]));
        }
        CliAgent::Codex => {
            out.extend(env_join("APPDATA", &["npm", "codex.cmd"]));
            out.extend(env_join(
                "LOCALAPPDATA",
                &["Programs", "codex", "codex.exe"],
            ));
        }
        CliAgent::Claude => {
            out.extend(env_join("APPDATA", &["npm", "claude.cmd"]));
            out.extend(env_join(
                "LOCALAPPDATA",
                &["Programs", "claude", "claude.exe"],
            ));
        }
    }
    out
}

/// 从 `.cmd`/`.bat` shim 文本里提取真实 `.exe` 路径。
///
/// npm 生成的 shim 形态固定：`"%dp0%\node_modules\...\foo.exe" %*`。
/// 这里按行扫描，取第一条「引号包裹且以 .exe 结尾」的路径，
/// 把 `%dp0%` 展开成 shim 所在目录后判断是否存在。
pub fn exe_from_shim(shim: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(shim).ok()?;
    let dir = shim.parent()?;

    for line in text.lines() {
        let Some(open) = line.find('"') else {
            continue;
        };
        let rest = &line[open + 1..];
        let Some(close) = rest.find('"') else {
            continue;
        };
        let raw = rest[..close].trim();
        if !raw.to_ascii_lowercase().ends_with(".exe") {
            continue;
        }

        // 展开 npm shim 里的 `%dp0%`（等价于 `%~dp0`）。
        let expanded = if raw.to_ascii_lowercase().starts_with("%dp0%") {
            let tail = raw["%dp0%".len()..].trim_start_matches(['\\', '/']);
            dir.join(tail)
        } else if Path::new(raw).is_absolute() {
            PathBuf::from(raw)
        } else {
            dir.join(raw)
        };

        if expanded.is_file() {
            return Some(expanded);
        }
    }
    None
}

/// 用 `where.exe` 查询命令名，返回第一个存在的命中。
fn where_lookup(name: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    let finder = "where.exe";
    #[cfg(not(windows))]
    let finder = "which";

    let output = Command::new(finder).arg(name).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .find(|path| path.is_file())
}

/// 扫描 PATH 里的目录，按常见可执行后缀查找。
fn scan_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let exts: &[&str] = if cfg!(windows) {
        &["exe", "cmd", "bat"]
    } else {
        &[""]
    };

    for dir in std::env::split_paths(&path) {
        for ext in exts {
            let candidate = if ext.is_empty() {
                dir.join(name)
            } else {
                dir.join(format!("{name}.{ext}"))
            };
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// 把一个候选路径归类成 `Exe` / `Shim`；不存在返回 `None`。
fn classify(path: &Path) -> Option<Resolved> {
    if !path.is_file() {
        return None;
    }
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if ext == "cmd" || ext == "bat" {
        // 能解析出真实 exe 就用 exe，解析不出才退回 shim。
        return Some(match exe_from_shim(path) {
            Some(exe) => Resolved::Exe(exe),
            None => Resolved::Shim(path.to_path_buf()),
        });
    }
    Some(Resolved::Exe(path.to_path_buf()))
}

/// 探测单个 CLI。
///
/// `override_path` 来自设置里的手动值：文件存在时**优先使用**，
/// 这样用户可以纠正自动探测的错误结果。
pub fn resolve(agent: CliAgent, override_path: Option<&str>) -> Resolved {
    if let Some(text) = override_path {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            if let Some(found) = classify(Path::new(trimmed)) {
                return found;
            }
        }
    }

    for candidate in candidates(agent) {
        if let Some(found) = classify(&candidate) {
            return found;
        }
    }

    if let Some(found) = where_lookup(agent.id()).and_then(|p| classify(&p)) {
        return found;
    }

    if let Some(found) = scan_path(agent.id()).and_then(|p| classify(&p)) {
        return found;
    }

    Resolved::Missing
}

/// 探测全部 CLI，返回 `(agent, 结果)` 列表。
pub fn resolve_all(overrides: &[(CliAgent, Option<String>)]) -> Vec<(CliAgent, Resolved)> {
    overrides
        .iter()
        .map(|(agent, path)| (*agent, resolve(*agent, path.as_deref())))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{exe_from_shim, resolve, CliAgent, Resolved};
    use std::path::PathBuf;

    /// 造一个临时目录，返回其路径；调用方负责清理。
    fn scratch(tag: &str) -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-scratch")
            .join(format!("probe-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("无法创建测试目录");
        dir
    }

    #[test]
    fn parses_npm_style_shim() {
        let dir = scratch("shim-ok");
        let bin = dir.join("node_modules").join("demo");
        std::fs::create_dir_all(&bin).unwrap();
        let exe = bin.join("demo.exe");
        std::fs::write(&exe, b"stub").unwrap();

        let shim = dir.join("demo.cmd");
        std::fs::write(
            &shim,
            "@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\n:start\r\n\"%dp0%\\node_modules\\demo\\demo.exe\"   %*\r\n",
        )
        .unwrap();

        let found = exe_from_shim(&shim).expect("应解析出真实 exe");
        assert_eq!(
            found.canonicalize().unwrap(),
            exe.canonicalize().unwrap(),
            "解析结果必须指向 shim 引用的 exe"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn malformed_shim_yields_none() {
        let dir = scratch("shim-bad");
        let shim = dir.join("broken.cmd");
        // 没有引号包裹的 exe，属于非标准 shim。
        std::fs::write(&shim, "@echo off\r\nnode \"%~dp0\\cli.js\" %*\r\n").unwrap();
        assert!(exe_from_shim(&shim).is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn nonexistent_override_falls_through_to_probing() {
        // 覆盖值指向不存在的文件时，必须继续走后续探测链，
        // 而不是把无效路径当作结果返回。
        let bogus = "C:\\definitely\\not\\here\\omp.exe";
        let result = resolve(CliAgent::Omp, Some(bogus));
        assert_ne!(result.path_text(), bogus, "不存在的覆盖值不能被采纳");
        // 结果取决于本机是否安装了 omp，因此只断言「不是那个无效路径」。
    }

    #[test]
    fn override_wins_when_file_exists() {
        let dir = scratch("override");
        let exe = dir.join("custom-omp.exe");
        std::fs::write(&exe, b"stub").unwrap();

        let result = resolve(CliAgent::Omp, Some(&exe.to_string_lossy()));
        match result {
            Resolved::Exe(path) => assert_eq!(path, exe),
            other => panic!("覆盖值应优先命中，实际得到 {other:?}"),
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn shim_only_file_resolves_to_shim() {
        let dir = scratch("shim-only");
        let shim = dir.join("only.cmd");
        // 内容是标准 shim 之外的文本，无法解析 exe，应退回 Shim。
        std::fs::write(&shim, "@echo off\r\necho hi\r\n").unwrap();

        let result = resolve(CliAgent::Codex, Some(&shim.to_string_lossy()));
        assert_eq!(result, Resolved::Shim(shim));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

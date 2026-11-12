//! 编辑器探测与文件夹启动。
//!
//! 新增编辑器支持只需要在 [`editor_candidates`] 里追加一项，其余流程
//! （探测、启动、URI 回退）会自动适配。

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

/// 一个可用编辑器的描述，供设置界面下拉框使用。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorInfo {
    pub id: String,
    pub name: String,
    pub available: bool,
    pub command: Option<String>,
}

/// 交互式 CLI 工具的可用性，用于快速启动浮窗的图标禁用态。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliAgentStatus {
    pub codex: bool,
    pub claude: bool,
}

/// 判断某个命令是否在 PATH 中可用。
///
/// Windows 的 npm 全局命令通常是 `.cmd`/`.ps1` shim，`where.exe` 能正确识别，
/// 因此这里不直接尝试 `Command::new(name)`。
fn command_available(name: &str) -> bool {
    #[cfg(windows)]
    let finder = "where.exe";
    #[cfg(not(windows))]
    let finder = "which";

    Command::new(finder)
        .arg(name)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

/// 探测 Codex 与 Claude Code 是否已安装。
pub fn detect_cli_agents() -> CliAgentStatus {
    CliAgentStatus {
        codex: command_available("codex"),
        claude: command_available("claude"),
    }
}

/// 已支持的编辑器清单：`(id, 展示名, 可执行文件候选路径)`。
///
/// 候选路径按优先级排列，命中第一个存在的即可。
fn editor_candidates() -> Vec<(&'static str, &'static str, Vec<String>)> {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let pf = std::env::var("ProgramFiles").unwrap_or_default();
    let pf86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();
    vec![
        (
            "vscode",
            "Visual Studio Code",
            vec![
                format!(r"{local}\Programs\Microsoft VS Code\Code.exe"),
                format!(r"{pf}\Microsoft VS Code\Code.exe"),
                format!(r"{pf86}\Microsoft VS Code\Code.exe"),
            ],
        ),
        (
            "vscode-insiders",
            "VS Code Insiders",
            vec![
                format!(r"{local}\Programs\Microsoft VS Code - Insiders\Code - Insiders.exe"),
                format!(r"{pf}\Microsoft VS Code - Insiders\Code - Insiders.exe"),
            ],
        ),
        (
            "cursor",
            "Cursor",
            vec![format!(r"{local}\Programs\cursor\Cursor.exe")],
        ),
        (
            "windsurf",
            "Windsurf",
            vec![format!(r"{local}\Programs\Windsurf\Windsurf.exe")],
        ),
    ]
}

/// 从 PATH 中定位 `code` 命令，作为常见安装路径都未命中时的兜底。
fn find_code_in_path() -> Option<String> {
    let output = Command::new("where.exe").arg("code").output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| line.ends_with(".exe") && PathBuf::from(line).exists())
        .map(str::to_string)
}

/// 探测本机已安装的编辑器。
pub fn detect_editors() -> Vec<EditorInfo> {
    editor_candidates()
        .into_iter()
        .map(|(id, name, paths)| {
            let command = paths
                .into_iter()
                .find(|p| PathBuf::from(p).exists())
                .or_else(|| (id == "vscode").then(find_code_in_path).flatten());
            EditorInfo {
                id: id.to_string(),
                name: name.to_string(),
                available: command.is_some(),
                command,
            }
        })
        .collect()
}

/// 解析最终要使用的可执行文件：用户指定的路径优先，其次按 id 探测。
fn resolve_editor(id: &str, override_path: Option<&str>) -> Option<String> {
    if let Some(path) = override_path {
        if !path.is_empty() && PathBuf::from(path).exists() {
            return Some(path.to_string());
        }
    }
    detect_editors()
        .into_iter()
        .find(|e| e.id == id && e.command.is_some())
        .and_then(|e| e.command)
}

/// 启动交互式 CLI agent。参数只由受控模式生成，避免拼接用户输入。
pub fn open_cli_agent(folder: &str, agent: &str, mode: &str) -> Result<String, String> {
    if !PathBuf::from(folder).is_dir() {
        return Err(format!("文件夹不存在: {folder}"));
    }

    let (command, args) = cli_agent_command(agent, mode)?;

    let command_line = if args.is_empty() {
        command.to_string()
    } else {
        format!("{command} {}", args.join(" "))
    };
    let mut process = cli_process(command, &args);
    process.current_dir(folder);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        process.creation_flags(CREATE_NEW_CONSOLE);
    }
    process
        .spawn()
        .map(|_| command_line)
        .map_err(|error| format!("启动 {agent} 失败，请确认命令已安装并位于 PATH：{error}"))
}

fn cli_agent_command(agent: &str, mode: &str) -> Result<(&'static str, Vec<&'static str>), String> {
    match agent {
        "codex" => match mode {
            "default" => Ok(("codex", vec![])),
            "danger-full-access" => Ok(("codex", vec!["--sandbox", "danger-full-access"])),
            "yolo" => Ok(("codex", vec!["--yolo"])),
            _ => Err(format!("不支持的 Codex 模式: {mode}")),
        },
        "claude" => match mode {
            "default" => Ok(("claude", vec![])),
            "acceptEdits" => Ok(("claude", vec!["--permission-mode", "acceptEdits"])),
            "dangerously-skip-permissions" => {
                Ok(("claude", vec!["--dangerously-skip-permissions"]))
            }
            _ => Err(format!("不支持的 Claude Code 模式: {mode}")),
        },
        _ => Err(format!("不支持的 CLI 工具: {agent}")),
    }
}

/// Windows 的 npm CLI 通常只有 `.cmd`/`.ps1` shim，直接 CreateProcess 不会像 shell 一样解析。
/// 这里只把固定的命令名和受控参数交给 cmd.exe，不接受用户输入作为命令或参数。
fn cli_process(command: &str, args: &[&str]) -> Command {
    #[cfg(windows)]
    {
        let mut process = Command::new("cmd.exe");
        process.args(["/d", "/c", command]).args(args);

        let npm_dir = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|path| path.join("npm"))
            .or_else(|| {
                std::env::var_os("USERPROFILE")
                    .map(PathBuf::from)
                    .map(|path| path.join("AppData").join("Roaming").join("npm"))
            });
        if let Some(npm_dir) = npm_dir.filter(|path| path.is_dir()) {
            let current_path = std::env::var_os("PATH").unwrap_or_default();
            let mut paths: Vec<_> = std::env::split_paths(&current_path).collect();
            let npm_dir_text = npm_dir.to_string_lossy();
            if !paths
                .iter()
                .any(|path| path.to_string_lossy().eq_ignore_ascii_case(&npm_dir_text))
            {
                paths.push(npm_dir);
            }
            if let Ok(path) = std::env::join_paths(paths) {
                process.env("PATH", path);
            }
        }
        process
    }

    #[cfg(not(windows))]
    {
        Command::new(command).args(args)
    }
}

/// 在编辑器中以新窗口打开文件夹，返回实际使用的命令（用于提示文案）。
pub fn open_folder(
    folder: &str,
    editor_id: &str,
    override_path: Option<&str>,
    trust_folder: bool,
) -> Result<String, String> {
    if !PathBuf::from(folder).is_dir() {
        return Err(format!("文件夹不存在: {folder}"));
    }

    let Some(command) = resolve_editor(editor_id, override_path) else {
        // 没找到可执行文件时，仅在「信任工作区未被要求关闭」的前提下
        // 退化到 URI 协议，否则无法保证 --disable-workspace-trust 生效。
        if editor_id != "vscode" || trust_folder {
            return Err(format!(
                "未检测到可执行的编辑器（{editor_id}），无法按当前设置启动文件夹"
            ));
        }
        let uri = format!("vscode://file/{}", folder.replace('\\', "/"));
        open_uri(&uri)?;
        return Ok("vscode://(URI)".into());
    };

    let mut process = Command::new(&command);
    process.env_remove("ELECTRON_RUN_AS_NODE");
    if trust_folder && matches!(editor_id, "vscode" | "vscode-insiders") {
        process.arg("--disable-workspace-trust");
    }
    process.args(["-n", folder]);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        process.creation_flags(CREATE_NO_WINDOW);
    }

    process
        .spawn()
        .map(|_| command.clone())
        .map_err(|e| format!("启动编辑器失败（{command}）：{e}"))
}

fn open_uri(uri: &str) -> Result<(), String> {
    Command::new("explorer")
        .arg(uri)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// 在资源管理器中选中该文件夹。
pub fn reveal_in_explorer(path: &str) -> Result<(), String> {
    Command::new("explorer")
        .arg(format!("/select,{path}"))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod cli_agent_tests {
    use super::cli_agent_command;

    #[test]
    fn claude_default_mode_has_no_arguments() {
        assert_eq!(
            cli_agent_command("claude", "default").unwrap(),
            ("claude", vec![])
        );
    }

    #[test]
    fn claude_explicit_modes_keep_their_arguments() {
        assert_eq!(
            cli_agent_command("claude", "acceptEdits").unwrap(),
            ("claude", vec!["--permission-mode", "acceptEdits"])
        );
        assert_eq!(
            cli_agent_command("claude", "dangerously-skip-permissions").unwrap(),
            ("claude", vec!["--dangerously-skip-permissions"])
        );
    }
}

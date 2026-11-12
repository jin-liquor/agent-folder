//! 编辑器探测与文件夹启动。
//!
//! 新增编辑器支持只需要在 [`editor_candidates`] 里追加一项，其余流程
//! （探测、启动、URI 回退）会自动适配。
//!
//! CLI（codex / claude / omp / opencode）的探测与路径解析见
//! [`super::cli_probe`]，参数分词见 [`super::cli_args`]，
//! 本模块只负责把它们启动起来。

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use super::cli_args::{build_cmdline, quote_arg};
use super::cli_probe::{self, CliAgent, Resolved};

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
    pub omp: bool,
    pub opencode: bool,
}

impl CliAgentStatus {
    fn from_available(mut check: impl FnMut(CliAgent) -> bool) -> Self {
        Self {
            codex: check(CliAgent::Codex),
            claude: check(CliAgent::Claude),
            omp: check(CliAgent::Omp),
            opencode: check(CliAgent::Opencode),
        }
    }
}

/// 探测各 CLI 是否可用。
///
/// 优先使用设置里缓存的路径（由启动时探测写入），缓存缺失时才现探，
/// 避免每次打开浮窗都 fork `where.exe`。
pub fn detect_cli_agents(cached: &crate::model::CliPaths) -> CliAgentStatus {
    CliAgentStatus::from_available(|agent| {
        let override_path = cached.get(agent);
        if !override_path.trim().is_empty() {
            return Path::new(override_path).is_file();
        }
        cli_probe::resolve(agent, None).is_available()
    })
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

/// omp 的启动方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OmpLaunchStyle {
    /// 直接启动 `omp.exe`（默认）。
    Direct,
    /// 在新 PowerShell 窗口里启动，保留用户 profile 的 PATH 与环境。
    PowerShell,
}

impl OmpLaunchStyle {
    pub fn parse(value: &str) -> Self {
        match value {
            "powershell" => Self::PowerShell,
            _ => Self::Direct,
        }
    }
}

/// PowerShell 单引号字符串转义：内部的 `'` 写成 `''`。
fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// PowerShell 解释器候选，按优先级排列。
///
/// 最后一级 `System32\WindowsPowerShell\v1.0\powershell.exe` 在 Windows 上
/// 始终存在，保证这条路径不会因为缺少 PowerShell 7 而完全失效。
fn powershell_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(found) = where_lookup("pwsh.exe") {
        out.push(found);
    }
    out.extend(env_path("ProgramFiles", &["PowerShell", "7", "pwsh.exe"]));
    out.extend(env_path(
        "LOCALAPPDATA",
        &["Microsoft", "WindowsApps", "pwsh.exe"],
    ));
    out.extend(env_path(
        "SystemRoot",
        &["System32", "WindowsPowerShell", "v1.0", "powershell.exe"],
    ));
    out
}

fn env_path(var: &str, rest: &[&str]) -> Option<PathBuf> {
    let base = std::env::var_os(var)?;
    let mut path = PathBuf::from(base);
    for part in rest {
        path.push(part);
    }
    Some(path)
}

fn where_lookup(name: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe").arg(name).output().ok()?;
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

/// 用 `cmd.exe /c start` 启动一个脱离父进程的新窗口，**立即返回**。
///
/// **为什么必须走 `start`**：应用本身是 `windows_subsystem = "windows"` 的
/// GUI 进程，没有控制台，`stdin/stdout/stderr` 三个句柄是 NULL。
/// 若直接用 `CreateProcess` + `CREATE_NEW_CONSOLE`，子进程虽然拿到了新控制台，
/// 但 `STARTUPINFO` 里仍然带着父进程那份 **NULL 标准句柄**，
/// 于是 TUI 程序检测到 stdout 不是终端，会立刻退出。
/// `start` 是 cmd 的内置命令，由它创建新控制台进程时不会传递
/// `STARTF_USESTDHANDLES`，子进程因此拿到新控制台的合法句柄。
///
/// **为什么注入 TERM**：父进程环境里可能带着 `TERM=dumb`（终端模拟器或
/// CI 常见的值），TUI 会据此拒绝进入交互界面。这里显式覆盖成
/// `xterm-256color`，并通过环境变量注入而不是拼进命令行——
/// 既没有解析开销，也避免了引号嵌套问题。
///
/// 参数说明：
/// - `start ""`：第一个带引号的位置是窗口标题，必须给空串，否则会把命令当标题；
/// - `/D <dir>`：设置工作目录（`start` 不继承调用方的目录语义）；
/// - 其余为被启动的命令与参数，统一经 [`quote_arg`] 转义。
///
/// 用 `spawn` 而不是 `output`：`output` 会阻塞到**子进程退出**才返回，
/// 用户会看到界面卡到 CLI 关闭为止。
fn spawn_detached(folder: &str, command: &str, args: &[String]) -> Result<(), String> {
    let mut line = String::from("start \"AgentFolder\" /D ");
    // start 的 /D 与程序名都必须带显式引号：
    // 实测同一条 omp.exe，不加引号时 start 会把它当成无效目标而不启动。
    line.push_str(&always_quote(folder));
    line.push(' ');
    line.push_str(&always_quote(command));
    for arg in args {
        line.push(' ');
        line.push_str(&always_quote(arg));
    }
    spawn_cmdline(&line)
}

/// 与 [`spawn_detached`] 相同，但被启动的是一个已拼好的命令行。
fn spawn_detached_cmdline(folder: &str, cmdline: &str) -> Result<(), String> {
    let mut line = String::from("start \"AgentFolder\" /D ");
    // start 的 /D 需要显式引号，否则路径含空格时会被切断。
    line.push_str(&always_quote(folder));
    line.push(' ');
    line.push_str(cmdline);
    spawn_cmdline(&line)
}

/// 执行 `cmd.exe /c <line>`，不等待被启动的程序。
/// 无条件加引号：`start` 的 `/D` 与程序名都要求显式引号，
/// 即便路径本身不含空格，提前加引号也不会出错，反而更稳。
fn always_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\\\""))
}

fn spawn_cmdline(line: &str) -> Result<(), String> {
    // 把最终命令行落到临时文件：`start` 的引号规则很难靠肉眼推断，
    // 出问题时必须能看到真正传给 cmd 的字符串。
    if let Some(dir) = std::env::var_os("TEMP") {
        let path = PathBuf::from(dir).join("agent-folder-spawn.log");
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            use std::io::Write;
            let _ = writeln!(file, "cmd.exe /d /c {line}");
        }
    }

    let mut process = Command::new("cmd.exe");
    process.arg("/d");

    // 清掉会让 TUI 误判终端能力的变量，再显式给一个安全的 TERM。
    process.env_remove("TERM_PROGRAM");
    process.env_remove("TERM_PROGRAM_VERSION");
    process.env_remove("CI");
    process.env("TERM", "xterm-256color");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        process.creation_flags(CREATE_NO_WINDOW);
        // cmd.exe 不认 Rust 的 `\"` 转义，必须用 raw_arg 原样拼入。
        process.raw_arg("/c");
        process.raw_arg(line);
    }
    #[cfg(not(windows))]
    {
        process.args(["/c", line]);
    }

    process
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("启动失败：{error}"))
}

pub fn open_cli_agent(
    folder: &str,
    agent: CliAgent,
    args: &[String],
    cached_path: Option<&str>,
    omp_style: OmpLaunchStyle,
) -> Result<String, String> {
    if !PathBuf::from(folder).is_dir() {
        return Err(format!("文件夹不存在: {folder}"));
    }

    let resolved = cli_probe::resolve(agent, cached_path);
    let exe = match &resolved {
        Resolved::Exe(path) | Resolved::Shim(path) => path.clone(),
        Resolved::Missing => {
            return Err(format!(
                "未检测到 {} 命令，请在设置 → CLI 可执行文件里指定路径",
                agent.label()
            ))
        }
    };

    let display = render_command(&exe.to_string_lossy(), args);

    // omp 可选用 PowerShell 启动：profile 里的 PATH 与代理配置都会生效。
    if agent == CliAgent::Omp && omp_style == OmpLaunchStyle::PowerShell {
        let shell = powershell_candidates()
            .into_iter()
            .find(|path| path.is_file())
            .ok_or_else(|| "未找到可用的 PowerShell（pwsh.exe 或 powershell.exe）".to_string())?;

        let mut invocation = format!("& {}", ps_quote(&exe.to_string_lossy()));
        for arg in args {
            invocation.push(' ');
            invocation.push_str(&ps_quote(arg));
        }
        let script = format!(
            "Set-Location -LiteralPath {}; {invocation}",
            ps_quote(folder)
        );
        spawn_detached(
            folder,
            &shell.to_string_lossy(),
            &["-NoExit".to_string(), "-Command".to_string(), script],
        )?;
        return Ok(format!("powershell → {display}"));
    }

    // `.cmd` / `.bat` shim 必须交给 cmd 解析；真实 exe 直接启动。
    let command = match &resolved {
        Resolved::Shim(_) => build_cmdline(&exe.to_string_lossy(), args),
        Resolved::Exe(_) => {
            let mut line = quote_arg(&exe.to_string_lossy());
            for arg in args {
                line.push(' ');
                line.push_str(&quote_arg(arg));
            }
            line
        }
        Resolved::Missing => unreachable!("上面已提前返回"),
    };

    // `start` 需要一个「可执行的东西」；shim 已拼成完整命令行，
    // 交给 `cmd /c` 再解释一次即可（start 支持直接给命令行）。
    spawn_detached_cmdline(folder, &command)?;
    Ok(display)
}

/// 拼接用于提示文案的命令行（不做 shell 转义，仅便于阅读）。
fn render_command(command: &str, args: &[String]) -> String {
    if args.is_empty() {
        command.to_string()
    } else {
        format!("{command} {}", args.join(" "))
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
    use super::{build_cmdline, OmpLaunchStyle};
    use crate::model::builtin_presets;
    use crate::services::cli_args::split_args;
    use crate::services::cli_probe::CliAgent;

    #[test]
    fn builtin_default_preset_yields_no_arguments() {
        for agent in CliAgent::ALL {
            let preset = builtin_presets(agent)
                .into_iter()
                .find(|p| p.id == "default")
                .expect("必须有默认预设");
            assert!(
                split_args(&preset.args).unwrap().is_empty(),
                "{} 的默认预设必须不附加任何参数",
                agent.label()
            );
        }
    }

    #[test]
    fn builtin_presets_parse_into_expected_argv() {
        let codex = builtin_presets(CliAgent::Codex);
        let dfa = codex.iter().find(|p| p.id == "danger-full-access").unwrap();
        assert_eq!(
            split_args(&dfa.args).unwrap(),
            vec!["--sandbox", "danger-full-access"]
        );

        let claude = builtin_presets(CliAgent::Claude);
        let edits = claude.iter().find(|p| p.id == "acceptEdits").unwrap();
        assert_eq!(
            split_args(&edits.args).unwrap(),
            vec!["--permission-mode", "acceptEdits"]
        );

        let omp = builtin_presets(CliAgent::Omp);
        let yolo = omp.iter().find(|p| p.id == "yolo").unwrap();
        assert_eq!(split_args(&yolo.args).unwrap(), vec!["--auto-approve"]);

        let opencode = builtin_presets(CliAgent::Opencode);
        let auto = opencode.iter().find(|p| p.id == "auto").unwrap();
        assert_eq!(split_args(&auto.args).unwrap(), vec!["--auto"]);
    }

    #[test]
    fn shim_cmdline_quotes_each_argument() {
        let line = build_cmdline(
            r"C:\Program Files\cli.cmd",
            &["--model".to_string(), "a b".to_string()],
        );
        assert_eq!(line, r#""C:\Program Files\cli.cmd" --model "a b""#);
    }

    #[test]
    fn omp_launch_style_falls_back_to_direct() {
        assert_eq!(
            OmpLaunchStyle::parse("powershell"),
            OmpLaunchStyle::PowerShell
        );
        assert_eq!(OmpLaunchStyle::parse("direct"), OmpLaunchStyle::Direct);
        assert_eq!(OmpLaunchStyle::parse("unexpected"), OmpLaunchStyle::Direct);
    }
}

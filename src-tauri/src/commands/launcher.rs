//! 启动相关命令：打开文件夹、资源管理器定位、编辑器与 CLI 探测。

use serde::Serialize;
use tauri::{AppHandle, State};

use super::folders::mutate_and_save;
use crate::model::FolderRecord;
use crate::services::cli_args::split_args;
use crate::services::cli_probe::{self, CliAgent};
use crate::services::editor::{self, CliAgentStatus, EditorInfo, OmpLaunchStyle};
use crate::storage::Store;
use crate::system::tray;

/// 打开成功后的返回值：更新后的记录 + 实际使用的命令。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    pub record: FolderRecord,
    pub command: String,
    pub history_saved: bool,
    pub history_error: Option<String>,
}

/// 在编辑器中打开文件夹，并记录一次历史。
///
/// `editor` 为空时使用设置里的默认编辑器。
#[tauri::command]
pub fn open_in_editor(
    app: AppHandle,
    state: State<Store>,
    path: String,
    editor: Option<String>,
) -> Result<OpenResult, String> {
    let (editor_id, override_path, trust_folders) = {
        let data = state.data();
        (
            editor.unwrap_or_else(|| data.settings.default_editor.clone()),
            data.settings.editor_path_override.clone(),
            data.settings.trust_folders,
        )
    };

    let command = editor::open_folder(&path, &editor_id, override_path.as_deref(), trust_folders)?;

    let (record, history_saved, history_error) = {
        let mut data = state.data();
        let snapshot = data.clone();
        let record = data.upsert(&path);
        match state.save_locked(&data) {
            Ok(()) => (record, true, None),
            Err(error) => {
                *data = snapshot;
                (record, false, Some(error))
            }
        }
    };
    if history_saved {
        tray::rebuild_menu(&app);
    }

    Ok(OpenResult {
        record,
        command,
        history_saved,
        history_error,
    })
}

/// 在项目目录中交互式启动 CLI（codex / claude / omp / opencode）。
///
/// 参数来自选中的预设：`mode` 是预设 id，参数串在该预设里。
/// 预设找不到时返回错误而不是退回默认模式——否则用户会以为自定义参数生效了。
///
/// `record` 为 `true` 时顺带把该目录写入打开历史——快速启动浮窗里打开的
/// 磁盘结果默认走这条路径，保证「用过的文件夹一定会出现在列表里」。
#[tauri::command]
pub fn open_cli_agent(
    app: AppHandle,
    state: State<Store>,
    path: String,
    agent: String,
    record: Option<bool>,
) -> Result<String, String> {
    let agent = CliAgent::parse(&agent).ok_or_else(|| format!("不支持的 CLI 工具: {agent}"))?;

    let (args, cached, style) = {
        let data = state.data();
        let settings = &data.settings;
        let mode = settings.mode_of(agent);
        let preset = settings.find_preset(agent, mode).ok_or_else(|| {
            format!(
                "{} 的启动模式「{mode}」不存在，请在设置里重新选择",
                agent.label()
            )
        })?;
        let args = split_args(&preset.args)?;
        (
            args,
            settings.cli_paths.get(agent).to_string(),
            OmpLaunchStyle::parse(&settings.omp_launch_style),
        )
    };

    let cached = (!cached.is_empty()).then_some(cached);
    let command = editor::open_cli_agent(&path, agent, &args, cached.as_deref(), style)?;

    if record.unwrap_or(false) {
        match mutate_and_save(&state, |data| Ok(data.upsert(&path))) {
            Ok(_) => tray::rebuild_menu(&app),
            Err(error) => eprintln!("{} 已启动，但历史记录保存失败：{error}", agent.id()),
        }
    }

    Ok(command)
}

/// 在资源管理器中选中文件夹。
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    editor::reveal_in_explorer(&path)
}

#[tauri::command]
pub fn detect_editors() -> Vec<EditorInfo> {
    editor::detect_editors()
}

/// 探测 Codex / Claude / omp / opencode 命令是否可用，用于快速启动图标禁用态。
///
/// 优先使用设置里缓存的路径；缓存为空时才现探，避免每次打开浮窗都 fork 子进程。
#[tauri::command]
pub fn detect_cli_agents(state: State<Store>) -> CliAgentStatus {
    let cached = state.data().settings.cli_paths.clone();
    editor::detect_cli_agents(&cached)
}

/// 返回各 CLI 当前解析到的可执行文件路径（设置页展示用）。
#[tauri::command]
pub fn resolve_cli_paths(state: State<Store>) -> Vec<(String, String)> {
    let data = state.data();
    cli_probe::CliAgent::ALL
        .iter()
        .map(|agent| {
            let cached = data.settings.cli_paths.get(*agent);
            let resolved = cli_probe::resolve(*agent, (!cached.is_empty()).then_some(cached));
            (agent.id().to_string(), resolved.path_text())
        })
        .collect()
}

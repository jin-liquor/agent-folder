//! 启动相关命令：打开文件夹、资源管理器定位、编辑器与 CLI 探测。

use serde::Serialize;
use tauri::{AppHandle, State};

use super::folders::mutate_and_save;
use crate::model::FolderRecord;
use crate::services::editor::{self, CliAgentStatus, EditorInfo};
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

/// 在项目目录中交互式启动 Codex CLI 或 Claude Code。
///
/// `record` 为 `true` 时顺带把该目录写入打开历史——快速启动浮窗里打开的
/// 磁盘结果默认走这条路径，保证「用过的文件夹一定会出现在列表里」。
/// 记录失败不会把启动成功改判为失败，只写 stderr，避免误导用户重复点击。
#[tauri::command]
pub fn open_cli_agent(
    app: AppHandle,
    state: State<Store>,
    path: String,
    agent: String,
    record: Option<bool>,
) -> Result<String, String> {
    let mode = {
        let data = state.data();
        match agent.as_str() {
            "codex" => data.settings.codex_mode.clone(),
            "claude" => data.settings.claude_mode.clone(),
            _ => return Err(format!("不支持的 CLI 工具: {agent}")),
        }
    };

    let command = editor::open_cli_agent(&path, &agent, &mode)?;

    if record.unwrap_or(false) {
        match mutate_and_save(&state, |data| Ok(data.upsert(&path))) {
            Ok(_) => tray::rebuild_menu(&app),
            Err(error) => eprintln!("{agent} 已启动，但历史记录保存失败：{error}"),
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

/// 探测 Codex / Claude 命令是否可用，用于快速启动图标禁用态。
#[tauri::command]
pub fn detect_cli_agents() -> CliAgentStatus {
    editor::detect_cli_agents()
}

//! 启动相关命令：打开文件夹、资源管理器定位、编辑器探测。

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::model::FolderRecord;
use crate::services::editor::{self, EditorInfo};
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

/// 在资源管理器中选中文件夹。
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    editor::reveal_in_explorer(&path)
}

/// 探测本机可用编辑器。
#[tauri::command]
pub fn detect_editors() -> Vec<EditorInfo> {
    editor::detect_editors()
}

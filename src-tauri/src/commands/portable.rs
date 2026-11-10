//! 数据导入导出。
//!
//! 导出：把当前全部记录与设置写成一个 JSON 文件，便于备份或迁移到另一台机器。
//! 导入：读取外部 JSON，**合并**进现有数据而不是整体覆盖，避免误操作清空历史。

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::model::FolderRecord;
use crate::storage::Store;
use crate::system::tray;

/// 导出文件的内容结构。
///
/// 带 `app` 与 `version` 字段，便于将来识别来源与做版本兼容。
#[derive(Serialize, Deserialize)]
pub struct ExportBundle {
    /// 固定标识，导入时用于确认文件类型。
    pub app: String,
    /// 导出格式版本，当前为 1。
    pub version: u32,
    pub folders: Vec<FolderRecord>,
}

/// 当前导出格式版本。
pub(crate) const EXPORT_VERSION: u32 = 1;
/// 导出文件标识。
pub(crate) const APP_TAG: &str = "agent-folder";

/// 导入结果，供界面提示具体数量。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    /// 新增的记录数。
    pub added: usize,
    /// 已存在、被跳过（或仅补全字段）的记录数。
    pub skipped: usize,
}

/// 导出全部记录到指定路径。
#[tauri::command]
pub fn export_data(state: State<Store>, path: String) -> Result<usize, String> {
    let folders = {
        let data = state.data();
        data.sorted_by_recent()
    };

    let bundle = ExportBundle {
        app: APP_TAG.to_string(),
        version: EXPORT_VERSION,
        folders: folders.clone(),
    };

    let json = serde_json::to_string_pretty(&bundle).map_err(|e| format!("序列化失败：{e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("写入文件失败：{e}"))?;
    Ok(folders.len())
}

/// 从指定路径导入记录，按路径去重后合并。
#[tauri::command]
pub fn import_data(
    app: AppHandle,
    state: State<Store>,
    path: String,
) -> Result<ImportSummary, String> {
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{e}"))?;
    let bundle: ExportBundle =
        serde_json::from_str(&raw).map_err(|e| format!("文件格式不正确：{e}"))?;

    if bundle.app != APP_TAG {
        return Err(format!(
            "这不是 Agent Folder 的导出文件（来源标识：{}）",
            bundle.app
        ));
    }
    if bundle.version > EXPORT_VERSION {
        return Err(format!(
            "导出文件版本 {} 高于当前支持的版本 {}，请升级应用",
            bundle.version, EXPORT_VERSION
        ));
    }

    // 合并与落盘全程持锁：导入可能一次写入上百条记录，
    // 若分两次加锁，中途的并发写入会与合并结果互相覆盖。
    let mut data = state.data();
    let snapshot = data.clone();
    let summary = data.merge_imported(bundle.folders);

    if let Err(error) = state.save_locked(&data) {
        *data = snapshot;
        return Err(error);
    }
    drop(data);

    tray::rebuild_menu(&app);
    Ok(summary)
}

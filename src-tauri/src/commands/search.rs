//! 搜索相关命令。

use tauri::State;

use crate::services::scanner;
use crate::storage::Store;

/// 磁盘扫描结果上限，避免一次返回过多路径拖慢界面。
const SCAN_LIMIT: usize = 60;

/// 在设置的根目录下按名称扫描文件夹。
///
/// 扫描是阻塞的文件系统遍历，放到 `spawn_blocking` 中执行，
/// 以免卡住 Tauri 的异步运行时。
#[tauri::command]
pub async fn scan_folders(state: State<'_, Store>, query: String) -> Result<Vec<String>, String> {
    let (enabled, roots) = {
        let data = state.data();
        (
            data.settings.scan_enabled,
            data.settings.search_roots.clone(),
        )
    };
    if !enabled {
        return Ok(Vec::new());
    }

    tauri::async_runtime::spawn_blocking(move || Ok(scanner::scan(&roots, &query, SCAN_LIMIT)))
        .await
        .map_err(|e| e.to_string())?
}

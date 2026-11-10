//! 设置相关命令。

use tauri::{AppHandle, State};

use crate::model::AppSettings;
use crate::storage::Store;
use crate::system::{hotkey, tray};

/// 读取当前设置。
#[tauri::command]
pub fn get_settings(state: State<Store>) -> AppSettings {
    state.data().settings.clone()
}

/// 保存设置。
///
/// 快捷键变更会先尝试注册：注册失败则整体回滚并返回错误，
/// 避免出现「设置已保存但快捷键实际不可用」的不一致状态。
///
/// 读旧值、写新值、回滚三步必须在**同一次持锁**内完成，否则并发保存会
/// 互相覆盖；快捷键注册（系统调用，可能耗时）则刻意放在锁外执行。
#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<Store>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    // 第一步：读取旧值并判断是否需要换快捷键（短暂持锁）。
    let previous = state.data().settings.clone();
    let hotkey_changed = settings.global_hotkey != previous.global_hotkey;

    // 第二步：锁外注册快捷键，避免系统调用阻塞其他命令。
    if hotkey_changed {
        if let Err(error) = hotkey::register_all(&app, &settings.global_hotkey) {
            // 注册失败时恢复原快捷键，保证系统状态与应用记录一致。
            let _ = hotkey::register_all(&app, &previous.global_hotkey);
            return Err(format!("快捷键设置失败：{error}"));
        }
    }

    // 第三步：写入并落盘，全程持锁，失败时在同一把锁内回滚。
    {
        let mut data = state.data();
        // 锁内重新读取，避免使用上面那份可能已过期的快照做回滚。
        let rollback = data.settings.clone();
        data.settings = settings.clone();

        if let Err(error) = state.save_locked(&data) {
            data.settings = rollback;
            drop(data);
            if hotkey_changed {
                let _ = hotkey::register_all(&app, &previous.global_hotkey);
            }
            return Err(error);
        }
    }

    // 托盘菜单里不含设置内容，但最近列表可能与磁盘状态不同步，
    // 这里刷新一次成本极低，可保持两者一致。
    tray::rebuild_menu(&app);
    Ok(settings)
}

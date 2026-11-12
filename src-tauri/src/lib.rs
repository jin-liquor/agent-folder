//! Agent Folder —— Tauri 后端入口。
//!
//! 分层结构：
//! - [`model`]     纯数据结构，无副作用
//! - [`storage`]   `data.json` 读写与内存态
//! - [`services`]  业务逻辑（编辑器启动、磁盘扫描）
//! - [`system`]    系统集成（托盘、快捷键、窗口）
//! - [`commands`]  暴露给前端的命令
//!
//! 启动流程只做装配，具体行为分散在上述模块中。

mod commands;
mod model;
mod services;
mod storage;
mod system;

#[cfg(test)]
mod lint_tests;
#[cfg(test)]
mod perf_tests;

use storage::Store;
use tauri::Manager;

/// 托盘创建需要在事件循环开始后进行，这里用短延迟规避
/// 「创建过早导致图标注册失败」的竞态。
const TRAY_SETUP_DELAY_MS: u64 = 500;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = Store::load();
    let index = services::index::IndexStore::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(store)
        .manage(index)
        .invoke_handler(crate::app_commands!())
        .setup(|app| {
            setup_tray_deferred(app.handle().clone());
            // 先装载缓存再后台重建：快速启动窗口首次打开即可搜索。
            commands::bootstrap_index(app.handle().clone());

            let hotkey = {
                let store = app.state::<Store>();
                let value = store.data().settings.global_hotkey.clone();
                value
            };
            let status = system::hotkey::register_all(app.handle(), &hotkey);
            if let Err(error) = status {
                eprintln!("注册快捷键失败: {error}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = {
                    let store = window.app_handle().state::<Store>();
                    let value = store.data().settings.close_to_tray;
                    value
                };
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 延迟到事件循环稳定后再创建托盘，避免图标注册失败。
fn setup_tray_deferred(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(TRAY_SETUP_DELAY_MS));
        let handle = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = system::tray::setup(&handle) {
                eprintln!("初始化系统托盘失败: {error}");
            }
        }) {
            eprintln!("调度系统托盘初始化失败: {error}");
        }
    });
}

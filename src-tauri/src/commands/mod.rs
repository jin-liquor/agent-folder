//! 命令层：暴露给前端的 `invoke` 接口。
//!
//! 每个子模块对应一个功能域，方便按需增删：
//! - [`browse`]：目录浏览（内置目录树）
//! - [`folders`]：文件夹记录的增删改查
//! - [`launcher`]：打开文件夹 / 定位 / 编辑器探测
//! - [`settings`]：设置读取与保存
//! - [`search`]：磁盘扫描
//! - [`portable`]：导入导出

mod browse;
mod folders;
mod launcher;
mod portable;
mod search;
mod settings;

#[cfg(test)]
mod portable_tests;
#[cfg(test)]
mod rollback_tests;

pub use browse::*;
pub use folders::*;
pub use launcher::*;
pub use portable::*;
pub use search::*;
pub use settings::*;

/// 命令注册清单。
///
/// 新增命令时只需在此追加一行，`lib.rs` 无需改动。
#[macro_export]
macro_rules! app_commands {
    () => {
        tauri::generate_handler![
            $crate::commands::list_folders,
            $crate::commands::add_folder,
            $crate::commands::remove_folder,
            $crate::commands::toggle_favorite,
            $crate::commands::rename_folder,
            $crate::commands::set_folder_color,
            $crate::commands::set_folder_tags,
            $crate::commands::check_missing_folders,
            $crate::commands::remove_missing_folders,
            $crate::commands::open_in_editor,
            $crate::commands::reveal_in_explorer,
            $crate::commands::detect_editors,
            $crate::commands::scan_folders,
            $crate::commands::get_settings,
            $crate::commands::get_storage_status,
            $crate::commands::recover_storage_backup,
            $crate::commands::reload_storage_data,
            $crate::commands::export_storage_backup,
            $crate::commands::get_hotkey_status,
            $crate::commands::retry_hotkeys,
            $crate::commands::save_settings,
            $crate::commands::export_data,
            $crate::commands::import_data,
            $crate::commands::list_drives,
            $crate::commands::list_subdirs,
        ]
    };
}

//! 系统托盘图标、菜单与事件处理。
//!
//! 托盘菜单包含：打开主界面、最近文件夹、退出。菜单内容会随记录变化
//! 重新构建，因此对外只暴露 [`setup`] 与 [`rebuild_menu`] 两个入口。

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::commands::mutate_and_save;
use crate::model::AppSettings;
use crate::services::editor;
use crate::storage::Store;
use crate::system::window;

/// 托盘图标 id，重建菜单时用于定位。
pub const TRAY_ID: &str = "main";

/// 托盘菜单里最多展示的最近文件夹数量。
const RECENT_LIMIT: usize = 8;

/// 菜单项 id 前缀：`open::<路径>`。
const OPEN_PREFIX: &str = "open::";

/// 构建当前状态的托盘菜单。
fn build_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let menu = Menu::new(app).map_err(|e| e.to_string())?;

    let (language, recent) = {
        let store = app.state::<Store>();
        let data = store.data();
        (data.settings.language.clone(), data.recent(RECENT_LIMIT))
    };
    let english = language == "en-US";
    let show_label = if english {
        "Show window"
    } else {
        "打开主界面"
    };
    let empty_label = if english {
        "(No recent folders)"
    } else {
        "（暂无最近文件夹）"
    };
    let quit_label = if english { "Quit" } else { "退出" };

    let show = MenuItem::with_id(app, "show", show_label, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&show).map_err(|e| e.to_string())?;
    menu.append(&PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    if recent.is_empty() {
        let placeholder = MenuItem::with_id(app, "noop", empty_label, false, None::<&str>)
            .map_err(|e| e.to_string())?;
        menu.append(&placeholder).map_err(|e| e.to_string())?;
    } else {
        for record in recent {
            let item = MenuItem::with_id(
                app,
                format!("{OPEN_PREFIX}{}", record.path),
                record.name,
                true,
                None::<&str>,
            )
            .map_err(|e| e.to_string())?;
            menu.append(&item).map_err(|e| e.to_string())?;
        }
    }

    menu.append(&PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&quit).map_err(|e| e.to_string())?;

    Ok(menu)
}

/// 记录变化后刷新托盘菜单（最近文件夹列表）。
pub fn rebuild_menu(app: &AppHandle) {
    let Ok(menu) = build_menu(app) else {
        return;
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// 从托盘直接打开某个文件夹，并更新历史记录。
fn open_and_record(app: &AppHandle, path: &str) {
    let (settings, override_path): (AppSettings, Option<String>) = {
        let store = app.state::<Store>();
        let data = store.data();
        (
            data.settings.clone(),
            data.settings.editor_path_override.clone(),
        )
    };

    let result = editor::open_folder(
        path,
        &settings.default_editor,
        override_path.as_deref(),
        settings.trust_folders,
    );

    match result {
        Ok(_) => {
            let store = app.state::<Store>();
            // 与其它写路径保持一致：改内存 → 存盘 → 失败回滚。
            // 之前这里直接吞掉存盘错误，界面会多出一条记录、重启即消失。
            match mutate_and_save(&store, |data| Ok(data.upsert(path))) {
                Ok(_) => rebuild_menu(app),
                Err(error) => eprintln!("从托盘打开文件夹后保存历史失败：{error}"),
            }
        }
        Err(error) => eprintln!("从托盘打开文件夹失败：{error}"),
    }
}

/// 处理托盘菜单点击。
fn on_menu_event(app: &AppHandle, id: &str) {
    match id {
        "show" => window::show(app),
        "quit" => app.exit(0),
        _ => {
            if let Some(path) = id.strip_prefix(OPEN_PREFIX) {
                open_and_record(app, path);
            }
        }
    }
}

/// 创建托盘图标与菜单。应在主线程调用。
pub fn setup(app: &AppHandle) -> Result<(), String> {
    let menu = build_menu(app)?;
    let icon = Image::from_bytes(include_bytes!("../../icons/32x32.png"))
        .map_err(|e| format!("加载托盘图标失败：{e}"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Agent Folder")
        .on_menu_event(|app, event| on_menu_event(app, event.id().0.as_str()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(())
}

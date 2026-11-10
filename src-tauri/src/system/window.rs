//! 主窗口的显示、隐藏与切换。
//!
//! 统一收口后，托盘点击、快捷键、命令面板都调用同一套逻辑，
//! 避免各处对「可见/最小化」判断不一致。

use tauri::{AppHandle, Manager};

/// 主窗口标签，与 `tauri.conf.json` 中的 `label` 保持一致。
pub const MAIN_WINDOW: &str = "main";

/// 快速启动浮窗标签。
pub const QUICK_WINDOW: &str = "quick";

/// 显示主窗口并置于前台。
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 隐藏主窗口（最小化到托盘）。
#[allow(dead_code)]
pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
    }
}

/// 在「显示」与「隐藏」之间切换。
///
/// 已最小化但未隐藏时也视为「需要显示」，这样从任务栏最小化后
/// 按快捷键/点托盘可以恢复，而不是被再隐藏一次。
pub fn toggle(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let minimized = window.is_minimized().unwrap_or(false);

    if visible && !minimized {
        let _ = window.hide();
    } else {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 显示或隐藏快速启动浮窗。
///
/// 浮窗是独立的无边框置顶窗口；显示时居中并聚焦，隐藏时直接收起。
/// 若浮窗尚未创建（配置异常），退回显示主窗口，保证快捷键总有响应。
pub fn toggle_quick(app: &AppHandle) {
    let Some(window) = app.get_webview_window(QUICK_WINDOW) else {
        show(app);
        return;
    };

    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

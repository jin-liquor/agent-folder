//! 全局快捷键注册。
//!
//! 目前有两组快捷键，都在 [`register_all`] 里一次性注册：
//!
//! - 呼出/隐藏主窗口（用户可在设置中修改）
//! - 呼出快速启动浮窗（固定为 `Ctrl+Shift+Space`）
//!
//! 由于插件按「全部注销再注册」的方式工作，新增快捷键必须走同一个入口，
//! 否则先注册的会被后注册的注销掉。

use std::str::FromStr;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::system::window;

/// 快速启动浮窗的固定快捷键。
///
/// 刻意避开 `Ctrl+Alt+Space`：该组合在 Windows 上常被输入法切换占用，
/// 注册会静默失败（错误 1409），导致快捷键完全无响应。
/// 选用 `Ctrl+Shift+Space`，冲突面小得多。
///
/// 不放进设置项，避免设置界面出现两个快捷键输入框造成困惑；
/// 若将来需要可配置，再扩展 `AppSettings` 即可。
pub const QUICK_LAUNCH_HOTKEY: &str = "Ctrl+Shift+Space";

/// 注册全部全局快捷键（先清空旧的注册）。
///
/// 返回实际注册成功的快捷键列表，便于调用方判断哪一组失效。
/// 注册失败不会中断其余快捷键：例如主窗口快捷键被占用时，
/// 快速启动仍应可用。
pub fn register_all(app: &AppHandle, toggle_hotkey: &str) -> Result<Vec<String>, String> {
    let toggle = Shortcut::from_str(toggle_hotkey)
        .map_err(|e| format!("无效的快捷键 {toggle_hotkey}: {e}"))?;
    let quick = Shortcut::from_str(QUICK_LAUNCH_HOTKEY)
        .map_err(|e| format!("无效的快捷键 {QUICK_LAUNCH_HOTKEY}: {e}"))?;

    let _ = app.global_shortcut().unregister_all();
    let mut registered = Vec::new();

    // 两组快捷键独立注册，一组失败不影响另一组。
    if app
        .global_shortcut()
        .on_shortcut(toggle, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                window::toggle(app);
            }
        })
        .is_ok()
    {
        registered.push(toggle_hotkey.to_string());
    } else {
        eprintln!("注册主窗口快捷键失败（可能已被其他程序占用）：{toggle_hotkey}");
    }

    if app
        .global_shortcut()
        .on_shortcut(quick, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                window::toggle_quick(app);
            }
        })
        .is_ok()
    {
        registered.push(QUICK_LAUNCH_HOTKEY.to_string());
    } else {
        eprintln!("注册快速启动快捷键失败（可能已被其他程序占用）：{QUICK_LAUNCH_HOTKEY}");
    }

    if registered.is_empty() {
        return Err("所有全局快捷键都注册失败，可能已被其他程序占用".into());
    }
    Ok(registered)
}

/// 校验快捷键字符串是否合法，不实际注册（设置界面即时校验用）。
#[allow(dead_code)]
pub fn validate(hotkey: &str) -> Result<(), String> {
    Shortcut::from_str(hotkey)
        .map(|_| ())
        .map_err(|e| format!("无效的快捷键 {hotkey}: {e}"))
}

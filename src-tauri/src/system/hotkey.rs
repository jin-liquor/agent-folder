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
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
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

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    pub toggle_hotkey: String,
    pub toggle_registered: bool,
    pub toggle_error: Option<String>,
    pub quick_hotkey: String,
    pub quick_registered: bool,
    pub quick_error: Option<String>,
}

static STATUS: OnceLock<Mutex<HotkeyStatus>> = OnceLock::new();

pub fn status() -> HotkeyStatus {
    STATUS
        .get_or_init(|| Mutex::new(HotkeyStatus::default()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

fn set_status(value: HotkeyStatus) {
    *STATUS
        .get_or_init(|| Mutex::new(HotkeyStatus::default()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = value;
}

/// 注册全部全局快捷键（先清空旧的注册）。
///
/// 两组快捷键分别记录成功与失败；单组冲突不会掩盖另一组的实际状态。
pub fn register_all(app: &AppHandle, toggle_hotkey: &str) -> Result<HotkeyStatus, String> {
    let toggle = Shortcut::from_str(toggle_hotkey)
        .map_err(|e| format!("无效的快捷键 {toggle_hotkey}: {e}"))?;
    let quick = Shortcut::from_str(QUICK_LAUNCH_HOTKEY)
        .map_err(|e| format!("无效的快捷键 {QUICK_LAUNCH_HOTKEY}: {e}"))?;

    let _ = app.global_shortcut().unregister_all();
    let toggle_result = app
        .global_shortcut()
        .on_shortcut(toggle, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                window::toggle(app);
            }
        });
    let quick_result = app
        .global_shortcut()
        .on_shortcut(quick, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                window::toggle_quick(app);
            }
        });

    let value = HotkeyStatus {
        toggle_hotkey: toggle_hotkey.to_string(),
        toggle_registered: toggle_result.is_ok(),
        toggle_error: toggle_result.err().map(|error| error.to_string()),
        quick_hotkey: QUICK_LAUNCH_HOTKEY.to_string(),
        quick_registered: quick_result.is_ok(),
        quick_error: quick_result.err().map(|error| error.to_string()),
    };
    if let Some(error) = &value.toggle_error {
        eprintln!("注册主窗口快捷键失败：{toggle_hotkey}: {error}");
    }
    if let Some(error) = &value.quick_error {
        eprintln!("注册快速启动快捷键失败：{QUICK_LAUNCH_HOTKEY}: {error}");
    }
    set_status(value.clone());
    Ok(value)
}

/// 校验快捷键字符串是否合法，不实际注册（设置界面即时校验用）。
#[allow(dead_code)]
pub fn validate(hotkey: &str) -> Result<(), String> {
    Shortcut::from_str(hotkey)
        .map(|_| ())
        .map_err(|e| format!("无效的快捷键 {hotkey}: {e}"))
}

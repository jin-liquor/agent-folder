//! 全局快捷键注册。
//!
//! 目前有两组快捷键，都在 [`register_all`] 里一次性注册：
//!
//! - 呼出/隐藏主窗口（`globalHotkey`，可在设置中修改）
//! - 呼出快速启动浮窗（`quickHotkey`，可在设置中修改，清空即禁用）
//!
//! 由于插件按「全部注销再注册」的方式工作，新增快捷键必须走同一个入口，
//! 否则先注册的会被后注册的注销掉。

use std::str::FromStr;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::system::window;

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
/// `quick_hotkey` 为空串表示用户主动禁用，跳过注册且不记为错误。
pub fn register_all(
    app: &AppHandle,
    toggle_hotkey: &str,
    quick_hotkey: &str,
) -> Result<HotkeyStatus, String> {
    let toggle = Shortcut::from_str(toggle_hotkey)
        .map_err(|e| format!("无效的快捷键 {toggle_hotkey}: {e}"))?;

    // 空值 = 禁用；非空但非法则记录下来，不阻断主窗口快捷键。
    let quick = if quick_hotkey.trim().is_empty() {
        None
    } else {
        Some(Shortcut::from_str(quick_hotkey))
    };

    let _ = app.global_shortcut().unregister_all();
    let toggle_result = app
        .global_shortcut()
        .on_shortcut(toggle, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                window::toggle(app);
            }
        });

    let (quick_registered, quick_error) = match quick {
        None => (false, None),
        Some(Ok(shortcut)) => {
            let result = app
                .global_shortcut()
                .on_shortcut(shortcut, |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        window::toggle_quick(app);
                    }
                });
            (result.is_ok(), result.err().map(|error| error.to_string()))
        }
        Some(Err(error)) => (false, Some(format!("无效的快捷键 {quick_hotkey}: {error}"))),
    };

    let value = HotkeyStatus {
        toggle_hotkey: toggle_hotkey.to_string(),
        toggle_registered: toggle_result.is_ok(),
        toggle_error: toggle_result.err().map(|error| error.to_string()),
        quick_hotkey: quick_hotkey.to_string(),
        quick_registered,
        quick_error,
    };
    if let Some(error) = &value.toggle_error {
        eprintln!("注册主窗口快捷键失败：{toggle_hotkey}: {error}");
    }
    if let Some(error) = &value.quick_error {
        eprintln!("注册快速启动快捷键失败：{quick_hotkey}: {error}");
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

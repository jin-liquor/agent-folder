//! 系统集成层：托盘、全局快捷键、窗口显隐。
//!
//! 与 Windows 壳层（Shell）打交道的一切都集中在这里，便于将来适配
//! 其他平台或替换实现。

pub mod hotkey;
pub mod tray;
pub mod window;

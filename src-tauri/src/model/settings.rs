//! 应用设置模型。
//!
//! 字段全部带 `#[serde(default)]`，因此旧版本 `data.json` 缺少新字段时
//! 会自动补默认值，无需手写迁移逻辑。

use serde::{Deserialize, Serialize};

/// 用户偏好设置。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: String,
    pub default_editor: String,
    pub global_hotkey: String,
    pub close_to_tray: bool,
    pub launch_on_startup: bool,
    pub hide_after_open: bool,
    /// 是否在启动 VS Code 时附加 `--disable-workspace-trust`。
    ///
    /// 注意语义：`true` 表示**跳过** VS Code 的工作区信任确认，
    /// 即降低安全防护以换取免打扰。字段名沿用历史命名，改名会破坏
    /// 旧 `data.json` 的兼容性，因此保留并在界面文案中说明真实含义。
    pub trust_folders: bool,
    pub search_roots: Vec<String>,
    pub editor_path_override: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            default_editor: "vscode".into(),
            global_hotkey: "Ctrl+Alt+V".into(),
            close_to_tray: true,
            launch_on_startup: false,
            hide_after_open: true,
            trust_folders: true,
            search_roots: default_search_roots(),
            editor_path_override: None,
        }
    }
}

/// 磁盘扫描的默认根目录：当前用户主目录。
fn default_search_roots() -> Vec<String> {
    std::env::var("USERPROFILE").ok().into_iter().collect()
}

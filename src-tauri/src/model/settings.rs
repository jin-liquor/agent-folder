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
    /// 是否跳过 VS Code 工作区信任确认（旧字段名为兼容性保留）。
    ///
    /// `true` 会附加 `--disable-workspace-trust`，降低安全防护；新安装默认关闭。
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
            trust_folders: false,
            search_roots: default_search_roots(),
            editor_path_override: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppSettings;

    #[test]
    fn trust_confirmation_is_enabled_by_default() {
        let settings = AppSettings::default();
        assert!(!settings.trust_folders);

        let old_data: AppSettings = serde_json::from_str("{\"trustFolders\":true}").unwrap();
        assert!(old_data.trust_folders, "显式旧值必须原样保留");

        let missing_field: AppSettings = serde_json::from_str("{}").unwrap();
        assert!(!missing_field.trust_folders, "缺失字段使用安全默认值");
    }
}

/// 磁盘扫描的默认根目录：当前用户主目录。
fn default_search_roots() -> Vec<String> {
    std::env::var("USERPROFILE").ok().into_iter().collect()
}

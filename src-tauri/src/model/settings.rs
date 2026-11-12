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
    pub scan_enabled: bool,
    pub editor_path_override: Option<String>,
    /// Codex CLI 的交互式启动策略。
    pub codex_mode: String,
    /// Claude Code 的交互式权限策略。
    pub claude_mode: String,
    /// 快速启动浮窗中按 `Enter` 的默认动作。
    ///
    /// 取值：`defaultEditor` | `vscode` | `codex` | `claude`。
    /// 默认仍是「默认编辑器」，不改变已有用户的操作习惯。
    pub quick_enter_action: String,
    /// 是否在快速启动结果行右侧显示打开方式图标。
    pub quick_open_with: bool,
}

impl AppSettings {
    /// Restore safe, supported CLI modes and quick-launch action after loading
    /// legacy or malformed data.
    pub fn normalize_cli_modes(&mut self) -> bool {
        let mut changed = false;
        if !matches!(
            self.codex_mode.as_str(),
            "default" | "danger-full-access" | "yolo"
        ) {
            self.codex_mode = "default".into();
            changed = true;
        }
        if !matches!(
            self.claude_mode.as_str(),
            "default" | "acceptEdits" | "dangerously-skip-permissions"
        ) {
            self.claude_mode = "default".into();
            changed = true;
        }
        if !matches!(
            self.quick_enter_action.as_str(),
            "defaultEditor" | "vscode" | "codex" | "claude"
        ) {
            self.quick_enter_action = "defaultEditor".into();
            changed = true;
        }
        changed
    }
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
            scan_enabled: true,
            editor_path_override: None,
            codex_mode: "default".into(),
            claude_mode: "default".into(),
            quick_enter_action: "defaultEditor".into(),
            quick_open_with: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppSettings;

    #[test]
    fn invalid_cli_modes_are_normalized() {
        let mut settings: AppSettings =
            serde_json::from_str(r#"{"codexMode":"unexpected","claudeMode":""}"#).unwrap();

        assert!(settings.normalize_cli_modes());
        assert_eq!(settings.codex_mode, "default");
        assert_eq!(settings.claude_mode, "default");
        assert!(!settings.normalize_cli_modes());
    }

    #[test]
    fn claude_default_mode_is_supported() {
        assert_eq!(AppSettings::default().claude_mode, "default");

        let mut settings: AppSettings =
            serde_json::from_str(r#"{"claudeMode":"default"}"#).unwrap();
        assert!(!settings.normalize_cli_modes());
        assert_eq!(settings.claude_mode, "default");
    }

    #[test]
    fn unknown_quick_action_falls_back_to_default_editor() {
        let mut settings: AppSettings =
            serde_json::from_str(r#"{"quickEnterAction":"sublime"}"#).unwrap();
        assert!(settings.normalize_cli_modes(), "非法动作应被纠正");
        assert_eq!(settings.quick_enter_action, "defaultEditor");

        let defaults = AppSettings::default();
        assert_eq!(defaults.quick_enter_action, "defaultEditor");
        assert!(defaults.quick_open_with, "打开方式图标默认显示");

        // 旧版本数据缺少新字段时必须补默认值，而不是报错。
        let legacy: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(legacy.quick_enter_action, "defaultEditor");
        assert!(legacy.quick_open_with);
    }

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

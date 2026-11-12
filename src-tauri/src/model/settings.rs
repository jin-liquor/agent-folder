//! 应用设置模型。
//!
//! 字段全部带 `#[serde(default)]`，因此旧版本 `data.json` 缺少新字段时
//! 会自动补默认值，无需手写迁移逻辑。

use serde::{Deserialize, Serialize};

use crate::services::cli_probe::CliAgent;

/// 探测到的 CLI 可执行文件绝对路径。
///
/// 空字符串表示未检测到。由启动时的一次探测写入，用户可以手动覆盖；
/// 保存绝对路径而不是每次现探，是因为 `where.exe` 有 15–40 ms 的进程开销，
/// 且像 omp 这种「在 PATH 里但 `where` 找不到」的情况必须靠缓存生效。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct CliPaths {
    pub codex: String,
    pub claude: String,
    pub omp: String,
    pub opencode: String,
    /// 探测时间戳（毫秒）。0 表示从未探测过。
    pub probed_at: u64,
}

impl CliPaths {
    /// 读取某个 CLI 的缓存路径。
    pub fn get(&self, agent: CliAgent) -> &str {
        match agent {
            CliAgent::Codex => &self.codex,
            CliAgent::Claude => &self.claude,
            CliAgent::Omp => &self.omp,
            CliAgent::Opencode => &self.opencode,
        }
    }

    /// 写入某个 CLI 的路径。
    pub fn set(&mut self, agent: CliAgent, value: String) {
        match agent {
            CliAgent::Codex => self.codex = value,
            CliAgent::Claude => self.claude = value,
            CliAgent::Omp => self.omp = value,
            CliAgent::Opencode => self.opencode = value,
        }
    }

    /// 缓存是否全部为空（从未探测）。
    pub fn is_empty(&self) -> bool {
        self.codex.is_empty()
            && self.claude.is_empty()
            && self.omp.is_empty()
            && self.opencode.is_empty()
    }

    /// 缓存里是否存在已失效的路径（文件被删除或移动）。
    ///
    /// 只有「记录了路径但文件不在」才算失效；空串表示未检测到，不算失效。
    pub fn has_stale_entry(&self) -> bool {
        [
            self.codex.as_str(),
            self.claude.as_str(),
            self.omp.as_str(),
            self.opencode.as_str(),
        ]
        .into_iter()
        .any(|path| !path.is_empty() && !std::path::Path::new(path).is_file())
    }
}

/// 一个启动模式预设。
///
/// 内置预设（`builtin = true`）由代码定义，保证「默认模式」等语义稳定；
/// 用户新增的预设可以自由改名与删除，参数串在启动时才分词。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CliPreset {
    /// 稳定标识：内置预设用固定值，用户预设用生成值。
    pub id: String,
    /// 下拉栏中显示的名称。
    pub name: String,
    /// 参数串，语法见 `services::cli_args::split_args`。
    pub args: String,
    /// 内置预设不可改名或删除。
    #[serde(default)]
    pub builtin: bool,
}

impl CliPreset {
    pub fn new(id: &str, name: &str, args: &str, builtin: bool) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            args: args.into(),
            builtin,
        }
    }
}

/// 各 CLI 的启动模式预设。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct CliPresets {
    pub codex: Vec<CliPreset>,
    pub claude: Vec<CliPreset>,
    pub omp: Vec<CliPreset>,
    pub opencode: Vec<CliPreset>,
}

impl CliPresets {
    /// 读取某个 CLI 的用户预设（内置预设不存储，由代码提供）。
    pub fn get(&self, agent: CliAgent) -> &[CliPreset] {
        match agent {
            CliAgent::Codex => &self.codex,
            CliAgent::Claude => &self.claude,
            CliAgent::Omp => &self.omp,
            CliAgent::Opencode => &self.opencode,
        }
    }

    /// 读取某个 CLI 用户预设的可变引用。
    pub fn get_mut(&mut self, agent: CliAgent) -> &mut Vec<CliPreset> {
        match agent {
            CliAgent::Codex => &mut self.codex,
            CliAgent::Claude => &mut self.claude,
            CliAgent::Omp => &mut self.omp,
            CliAgent::Opencode => &mut self.opencode,
        }
    }
}

/// 内置预设：由代码提供，不可删除。
///
/// `default` 必须存在且参数为空——它是「不附加任何参数」的固定行为，
/// 也是旧版本默认模式的等价物。
pub fn builtin_presets(agent: CliAgent) -> Vec<CliPreset> {
    match agent {
        CliAgent::Codex => vec![
            CliPreset::new("default", "默认", "", true),
            CliPreset::new(
                "danger-full-access",
                "danger-full-access（高风险）",
                "--sandbox danger-full-access",
                true,
            ),
            CliPreset::new("yolo", "yolo（高风险）", "--yolo", true),
        ],
        CliAgent::Claude => vec![
            CliPreset::new("default", "默认", "", true),
            CliPreset::new(
                "acceptEdits",
                "acceptEdits",
                "--permission-mode acceptEdits",
                true,
            ),
            CliPreset::new(
                "dangerously-skip-permissions",
                "跳过权限确认（高风险）",
                "--dangerously-skip-permissions",
                true,
            ),
        ],
        CliAgent::Omp => vec![
            CliPreset::new("default", "默认", "", true),
            CliPreset::new("yolo", "yolo（自动批准）", "--auto-approve", true),
        ],
        CliAgent::Opencode => vec![
            CliPreset::new("default", "默认", "", true),
            CliPreset::new("auto", "auto（自动批准）", "--auto", true),
        ],
    }
}

/// 内置预设的 id 清单，用于校验选中值是否合法。
pub fn builtin_preset_ids(agent: CliAgent) -> Vec<&'static str> {
    match agent {
        CliAgent::Codex => vec!["default", "danger-full-access", "yolo"],
        CliAgent::Claude => vec!["default", "acceptEdits", "dangerously-skip-permissions"],
        CliAgent::Omp => vec!["default", "yolo"],
        CliAgent::Opencode => vec!["default", "auto"],
    }
}

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
    /// 当前选中的预设 id（内置或用户预设）。
    pub codex_mode: String,
    pub claude_mode: String,
    pub omp_mode: String,
    pub opencode_mode: String,
    /// 用户自建的启动模式预设；内置预设不存这里。
    pub cli_presets: CliPresets,
    /// 旧版本的「附加参数」。仅用于迁移到 `cli_presets`，迁移后清空。
    pub codex_extra_args: String,
    pub claude_extra_args: String,
    pub omp_extra_args: String,
    pub opencode_extra_args: String,
    /// omp 的启动方式：`direct`（默认，直接启动 omp.exe）或 `powershell`。
    pub omp_launch_style: String,
    /// 探测到的 CLI 路径缓存。
    pub cli_paths: CliPaths,
    /// 快速启动浮窗中按 `Enter` 的默认动作。
    ///
    /// 取值：`defaultEditor` | `vscode` | `codex` | `claude` | `omp` | `opencode`。
    pub quick_enter_action: String,
    /// 是否在快速启动结果行右侧显示打开方式图标。
    pub quick_open_with: bool,
    /// 快速启动浮窗的全局快捷键；空串表示用户主动禁用。
    pub quick_hotkey: String,
}

/// 快速启动快捷键的默认值。
///
/// 用户在 1.2.0 指定用 `Ctrl+Space`。
pub const DEFAULT_QUICK_HOTKEY: &str = "Ctrl+Space";

/// 1.1.1 及更早版本的快速启动快捷键默认值。
///
/// 用于一次性迁移：只有「仍然是旧默认值」的用户才升级到新默认值，
/// 主动改过或清空禁用的用户保持原样。
pub const LEGACY_QUICK_HOTKEYS: [&str; 2] = ["Ctrl+Shift+Space", "Super+Space"];

/// 合法的快速启动动作。
pub const QUICK_ACTIONS: [&str; 6] = [
    "defaultEditor",
    "vscode",
    "codex",
    "claude",
    "omp",
    "opencode",
];
/// 合法的 omp 启动方式。
pub const OMP_LAUNCH_STYLES: [&str; 2] = ["direct", "powershell"];

impl AppSettings {
    /// 某个 CLI 当前选中的预设 id。
    pub fn mode_of(&self, agent: CliAgent) -> &str {
        match agent {
            CliAgent::Codex => &self.codex_mode,
            CliAgent::Claude => &self.claude_mode,
            CliAgent::Omp => &self.omp_mode,
            CliAgent::Opencode => &self.opencode_mode,
        }
    }

    fn mode_of_mut(&mut self, agent: CliAgent) -> &mut String {
        match agent {
            CliAgent::Codex => &mut self.codex_mode,
            CliAgent::Claude => &mut self.claude_mode,
            CliAgent::Omp => &mut self.omp_mode,
            CliAgent::Opencode => &mut self.opencode_mode,
        }
    }

    /// 全部预设 = 内置 + 用户自建。
    pub fn presets_of(&self, agent: CliAgent) -> Vec<CliPreset> {
        let mut all = builtin_presets(agent);
        all.extend(self.cli_presets.get(agent).iter().cloned());
        all
    }

    /// 按 id 查找预设。
    pub fn find_preset(&self, agent: CliAgent, id: &str) -> Option<CliPreset> {
        self.presets_of(agent).into_iter().find(|p| p.id == id)
    }

    /// 把越界的枚举值恢复成安全默认值。
    ///
    /// 同时把旧版本的「`custom` 模式 + 附加参数」迁移成用户预设，
    /// 保证升级后用户的自定义参数不会丢失。
    pub fn normalize(&mut self) -> bool {
        let mut changed = false;

        changed |= self.migrate_legacy_extra_args();

        for agent in CliAgent::ALL {
            // 选中值必须能在「内置 + 用户预设」里找到。
            let known: Vec<String> = self.presets_of(agent).into_iter().map(|p| p.id).collect();
            if !known.iter().any(|id| id == self.mode_of(agent)) {
                *self.mode_of_mut(agent) = "default".into();
                changed = true;
            }

            // 用户预设的 id / 名称不能为空，参数可为空。
            let existing_ids: Vec<String> = self
                .cli_presets
                .get(agent)
                .iter()
                .map(|p| p.id.clone())
                .collect();
            let mut cleaned: Vec<CliPreset> = Vec::new();
            for preset in self.cli_presets.get(agent).iter() {
                let mut preset = preset.clone();
                if preset.id.trim().is_empty() {
                    preset.id = format!("user-{}", cleaned.len() + 1);
                    changed = true;
                }
                if preset.name.trim().is_empty() {
                    preset.name = preset.id.clone();
                    changed = true;
                }
                // 内置 id 不能被用户预设占用，否则会覆盖内置语义。
                if builtin_preset_ids(agent).contains(&preset.id.as_str()) {
                    preset.id = format!("{}-user", preset.id);
                    changed = true;
                }
                if cleaned.iter().any(|p: &CliPreset| p.id == preset.id) {
                    preset.id = format!("{}-2", preset.id);
                    changed = true;
                }
                preset.builtin = false;
                cleaned.push(preset);
            }
            let _ = existing_ids;
            if cleaned != self.cli_presets.get(agent) {
                *self.cli_presets.get_mut(agent) = cleaned;
                changed = true;
            }
        }

        changed |= reset_if_invalid(
            &mut self.quick_enter_action,
            &QUICK_ACTIONS,
            "defaultEditor",
        );
        changed |= reset_if_invalid(&mut self.omp_launch_style, &OMP_LAUNCH_STYLES, "direct");

        // 快捷键不能为空：空串会让注册必然失败，界面还会显示成「未注册」。
        if self.global_hotkey.trim().is_empty() {
            self.global_hotkey = "Ctrl+Alt+V".into();
            changed = true;
        }
        // 快速启动快捷键允许为空（表示用户主动禁用），只在纯空白时归一化。
        if self.quick_hotkey.trim().is_empty() && !self.quick_hotkey.is_empty() {
            self.quick_hotkey.clear();
            changed = true;
        }

        // 旧默认值迁移：1.2.0 把默认快速启动快捷键改成了 `Ctrl+Space`。
        // 用户从未改过这一项时，旧数据里残留的是某个旧默认值，
        // 直接替换成新默认值；用户主动改成别的组合（或清空禁用）则原样保留。
        if LEGACY_QUICK_HOTKEYS.contains(&self.quick_hotkey.as_str()) {
            self.quick_hotkey = DEFAULT_QUICK_HOTKEY.into();
            changed = true;
        }

        changed
    }

    /// 旧字段迁移：`*_extra_args` → 用户预设。
    ///
    /// 旧版本是「模式 + 附加参数」两段式，`custom` 模式表示只用附加参数。
    /// 新版改为「预设列表」，因此把非空附加参数变成一条可直接选用/删除的预设。
    fn migrate_legacy_extra_args(&mut self) -> bool {
        let mut changed = false;
        for agent in CliAgent::ALL {
            let legacy = match agent {
                CliAgent::Codex => self.codex_extra_args.clone(),
                CliAgent::Claude => self.claude_extra_args.clone(),
                CliAgent::Omp => self.omp_extra_args.clone(),
                CliAgent::Opencode => self.opencode_extra_args.clone(),
            };
            if legacy.trim().is_empty() {
                continue;
            }
            // 已迁移过（存在同参数预设）就不再重复添加。
            if self
                .cli_presets
                .get(agent)
                .iter()
                .any(|preset| preset.args.trim() == legacy.trim())
            {
                continue;
            }
            let preset = CliPreset::new(
                &format!("migrated-{}", crate::model::now_ms()),
                "自定义参数",
                legacy.trim(),
                false,
            );
            let selected = self.mode_of(agent) == "custom";
            let id = preset.id.clone();
            self.cli_presets.get_mut(agent).push(preset);
            if selected {
                *self.mode_of_mut(agent) = id;
            }
            changed = true;
        }

        // 迁移后清空旧字段，避免重复迁移。
        if changed {
            self.codex_extra_args.clear();
            self.claude_extra_args.clear();
            self.omp_extra_args.clear();
            self.opencode_extra_args.clear();
        }
        changed
    }

    /// 旧方法名保留，避免调用方一次性大改。
    pub fn normalize_cli_modes(&mut self) -> bool {
        self.normalize()
    }
}

/// 值不在白名单里就替换成默认值，返回是否发生替换。
fn reset_if_invalid(value: &mut String, allowed: &[&str], fallback: &str) -> bool {
    if allowed.contains(&value.as_str()) {
        return false;
    }
    *value = fallback.to_string();
    true
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
            omp_mode: "default".into(),
            opencode_mode: "default".into(),
            cli_presets: CliPresets::default(),
            codex_extra_args: String::new(),
            claude_extra_args: String::new(),
            omp_extra_args: String::new(),
            opencode_extra_args: String::new(),
            omp_launch_style: "direct".into(),
            cli_paths: CliPaths::default(),
            quick_enter_action: "defaultEditor".into(),
            quick_open_with: true,
            quick_hotkey: DEFAULT_QUICK_HOTKEY.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{builtin_presets, AppSettings, CliPaths, CliPreset, DEFAULT_QUICK_HOTKEY};
    use crate::services::cli_probe::CliAgent;

    #[test]
    fn builtin_default_preset_has_no_args() {
        for agent in CliAgent::ALL {
            let default = builtin_presets(agent)
                .into_iter()
                .find(|p| p.id == "default")
                .expect("每个 CLI 都必须有 default 预设");
            assert!(
                default.args.is_empty(),
                "{} 的默认预设不能带参数",
                agent.label()
            );
        }
    }

    #[test]
    fn invalid_selected_preset_falls_back_to_default() {
        let mut settings: AppSettings =
            serde_json::from_str(r#"{"codexMode":"unexpected","claudeMode":""}"#).unwrap();
        assert!(settings.normalize());
        assert_eq!(settings.codex_mode, "default");
        assert_eq!(settings.claude_mode, "default");
        assert!(!settings.normalize(), "重复归一化不应再报告改动");
    }

    #[test]
    fn legacy_claude_modes_survive_normalization() {
        for mode in ["acceptEdits", "dangerously-skip-permissions"] {
            let json = format!(r#"{{"claudeMode":"{mode}"}}"#);
            let mut settings: AppSettings = serde_json::from_str(&json).unwrap();
            assert!(!settings.normalize());
            assert_eq!(settings.claude_mode, mode);
        }
    }

    #[test]
    fn user_presets_are_kept_and_selectable() {
        let json = r#"{
            "ompMode": "user-fast",
            "cliPresets": {
                "omp": [{ "id": "user-fast", "name": "快速", "args": "--model gpt-5.2" }]
            }
        }"#;
        let mut settings: AppSettings = serde_json::from_str(json).unwrap();
        assert!(!settings.normalize());
        assert_eq!(settings.omp_mode, "user-fast");
        let preset = settings.find_preset(CliAgent::Omp, "user-fast").unwrap();
        assert_eq!(preset.args, "--model gpt-5.2");
    }

    #[test]
    fn preset_displayed_as_builtin_from_json_is_downgraded() {
        // 内置标记只能由代码提供，数据里伪造的必须被清掉。
        let json = r#"{"cliPresets":{"omp":[{"id":"x","name":"x","args":"","builtin":true}]}}"#;
        let mut settings: AppSettings = serde_json::from_str(json).unwrap();
        settings.normalize();
        assert!(!settings.cli_presets.omp[0].builtin);
    }

    #[test]
    fn user_preset_cannot_shadow_builtin_id() {
        let json = r#"{"cliPresets":{"omp":[{"id":"default","name":"假的默认","args":"--evil"}]}}"#;
        let mut settings: AppSettings = serde_json::from_str(json).unwrap();
        settings.normalize();
        assert_ne!(settings.cli_presets.omp[0].id, "default");
        // 内置 default 仍然是空参数。
        let builtin = settings.find_preset(CliAgent::Omp, "default").unwrap();
        assert!(builtin.args.is_empty());
    }

    #[test]
    fn legacy_extra_args_migrate_into_presets() {
        let json = r#"{"ompMode":"custom","ompExtraArgs":"--model opus"}"#;
        let mut settings: AppSettings = serde_json::from_str(json).unwrap();
        assert!(settings.normalize());
        // 旧附加参数变成一条用户预设，并被选中。
        let preset = settings
            .find_preset(CliAgent::Omp, &settings.omp_mode)
            .expect("迁移后选中值必须有效");
        assert_eq!(preset.args, "--model opus");
        assert!(settings.omp_extra_args.is_empty(), "迁移后旧字段应清空");

        // 再跑一次不应重复迁移。
        let before = settings.cli_presets.omp.len();
        assert!(!settings.normalize());
        assert_eq!(settings.cli_presets.omp.len(), before);
    }

    #[test]
    fn preset_with_blank_name_gets_a_fallback() {
        let json = r#"{"cliPresets":{"omp":[{"id":"a","name":"  ","args":"--x"}]}}"#;
        let mut settings: AppSettings = serde_json::from_str(json).unwrap();
        settings.normalize();
        assert!(!settings.cli_presets.omp[0].name.trim().is_empty());
    }

    #[test]
    fn duplicate_preset_ids_are_disambiguated() {
        let json = r#"{"cliPresets":{"omp":[
            {"id":"a","name":"A","args":""},
            {"id":"a","name":"B","args":""}
        ]}}"#;
        let mut settings: AppSettings = serde_json::from_str(json).unwrap();
        settings.normalize();
        let ids: Vec<&str> = settings
            .cli_presets
            .omp
            .iter()
            .map(|p: &CliPreset| p.id.as_str())
            .collect();
        assert_ne!(ids[0], ids[1]);
    }

    #[test]
    fn new_cli_defaults_are_fixed_behaviour() {
        let settings = AppSettings::default();
        assert_eq!(settings.omp_mode, "default");
        assert_eq!(settings.opencode_mode, "default");
        assert_eq!(settings.omp_launch_style, "direct");
        assert!(settings.cli_presets.omp.is_empty());
    }

    #[test]
    fn invalid_omp_settings_fall_back() {
        let mut settings: AppSettings = serde_json::from_str(
            r#"{"ompMode":"nope","opencodeMode":"yolo","ompLaunchStyle":"weird"}"#,
        )
        .unwrap();
        assert!(settings.normalize());
        assert_eq!(settings.omp_mode, "default");
        // yolo 不是 opencode 的预设，应回落。
        assert_eq!(settings.opencode_mode, "default");
        assert_eq!(settings.omp_launch_style, "direct");
    }

    #[test]
    fn unknown_quick_action_falls_back_to_default_editor() {
        let mut settings: AppSettings =
            serde_json::from_str(r#"{"quickEnterAction":"sublime"}"#).unwrap();
        assert!(settings.normalize(), "非法动作应被纠正");
        assert_eq!(settings.quick_enter_action, "defaultEditor");

        let legacy: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(legacy.quick_enter_action, "defaultEditor");
        assert!(legacy.quick_open_with);
    }

    #[test]
    fn new_quick_actions_are_accepted() {
        for action in ["omp", "opencode"] {
            let json = format!(r#"{{"quickEnterAction":"{action}"}}"#);
            let mut settings: AppSettings = serde_json::from_str(&json).unwrap();
            assert!(!settings.normalize());
            assert_eq!(settings.quick_enter_action, action);
        }
    }

    #[test]
    fn quick_hotkey_defaults_and_allows_explicit_disable() {
        let defaults = AppSettings::default();
        assert_eq!(defaults.quick_hotkey, DEFAULT_QUICK_HOTKEY);

        let legacy: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(legacy.quick_hotkey, DEFAULT_QUICK_HOTKEY);

        let mut disabled: AppSettings = serde_json::from_str(r#"{"quickHotkey":""}"#).unwrap();
        assert!(!disabled.normalize());
        assert!(disabled.quick_hotkey.is_empty());

        let mut blank: AppSettings = serde_json::from_str(r#"{"quickHotkey":"   "}"#).unwrap();
        assert!(blank.normalize());
        assert!(blank.quick_hotkey.is_empty());
    }

    #[test]
    fn legacy_quick_hotkey_is_upgraded_to_new_default() {
        // 旧版本默认值必须一次性升级成 Win+Space。
        let mut legacy: AppSettings =
            serde_json::from_str(r#"{"quickHotkey":"Ctrl+Shift+Space"}"#).unwrap();
        assert!(legacy.normalize());
        assert_eq!(legacy.quick_hotkey, DEFAULT_QUICK_HOTKEY);

        // 用户主动改成别的组合时不能被覆盖。
        let mut custom: AppSettings =
            serde_json::from_str(r#"{"quickHotkey":"Ctrl+Alt+K"}"#).unwrap();
        assert!(!custom.normalize());
        assert_eq!(custom.quick_hotkey, "Ctrl+Alt+K");

        // 主动禁用（空串）也要保持禁用。
        let mut disabled: AppSettings = serde_json::from_str(r#"{"quickHotkey":""}"#).unwrap();
        assert!(!disabled.normalize());
        assert!(disabled.quick_hotkey.is_empty());
    }

    #[test]
    fn global_hotkey_never_stays_empty() {
        let mut settings: AppSettings = serde_json::from_str(r#"{"globalHotkey":"  "}"#).unwrap();
        assert!(settings.normalize());
        assert_eq!(settings.global_hotkey, "Ctrl+Alt+V");
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

    #[test]
    fn cli_paths_round_trip_and_staleness() {
        let mut paths = CliPaths::default();
        assert!(paths.is_empty());
        assert!(!paths.has_stale_entry(), "空缓存不算失效");

        paths.set(CliAgent::Omp, "C:\\nowhere\\omp.exe".into());
        assert!(!paths.is_empty());
        assert!(paths.has_stale_entry(), "记录了但文件不存在应判为失效");

        let mut missing = CliPaths::default();
        missing.set(CliAgent::Codex, String::new());
        assert!(!missing.has_stale_entry());
    }
}

/// 磁盘扫描的默认根目录：当前用户主目录。
fn default_search_roots() -> Vec<String> {
    std::env::var("USERPROFILE").ok().into_iter().collect()
}

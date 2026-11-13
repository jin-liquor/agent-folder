//! 设置相关命令。

use tauri::{AppHandle, State};

use crate::model::{AppSettings, CliPaths};
use crate::services::{cli_probe, editor};
use crate::storage::{StorageStatus, Store};
use crate::system::{hotkey, tray};

/// 读取当前设置。
#[tauri::command]
pub fn get_settings(state: State<Store>) -> AppSettings {
    state.data().settings.clone()
}

/// 返回启动时的数据恢复或保护状态。
#[tauri::command]
pub fn get_storage_status(state: State<Store>) -> StorageStatus {
    state.status()
}

/// 恢复启动时检测到的损坏数据备份。
#[tauri::command]
pub fn recover_storage_backup(state: State<Store>) -> Result<usize, String> {
    state.recover_backup()
}

/// 从磁盘重新加载数据，并刷新只读保护状态。
#[tauri::command]
pub fn reload_storage_data(state: State<Store>) -> Result<usize, String> {
    state.reload()
}

/// 将启动时检测到的损坏备份原样导出到用户指定位置。
#[tauri::command]
pub fn export_storage_backup(state: State<Store>, path: String) -> Result<(), String> {
    state.export_backup(std::path::Path::new(&path))
}

#[tauri::command]
pub fn get_hotkey_status() -> hotkey::HotkeyStatus {
    hotkey::status()
}

/// 使用当前保存的设置重新注册快捷键。
#[tauri::command]
pub fn retry_hotkeys(state: State<Store>, app: AppHandle) -> Result<hotkey::HotkeyStatus, String> {
    let (toggle, quick) = {
        let data = state.data();
        (
            data.settings.global_hotkey.clone(),
            data.settings.quick_hotkey.clone(),
        )
    };
    hotkey::register_all(&app, &toggle, &quick)
}

/// 重新探测全部 CLI 的可执行文件路径，并把结果写入设置。
///
/// 供设置页的「重新探测」按钮调用；启动时的自动探测也复用这里的逻辑。
#[tauri::command]
pub fn refresh_cli_paths(
    app: AppHandle,
    state: State<Store>,
) -> Result<(CliPaths, editor::CliAgentStatus), String> {
    let (paths, status) = probe_and_store(&state)?;
    tray::rebuild_menu(&app);
    Ok((paths, status))
}

#[tauri::command]
pub fn set_cli_path(
    state: State<Store>,
    agent: String,
    path: Option<String>,
) -> Result<CliPaths, String> {
    let agent =
        cli_probe::CliAgent::parse(&agent).ok_or_else(|| format!("不支持的 CLI 工具: {agent}"))?;
    let path = path.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    });

    if let Some(path) = path.as_deref() {
        let extension = std::path::Path::new(path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !["exe", "cmd", "bat"].contains(&extension.as_str()) {
            return Err("路径必须指向 .exe、.cmd 或 .bat 文件".into());
        }
        if !std::path::Path::new(path).is_file() {
            return Err("指定的 CLI 文件不存在".into());
        }
    }

    let mut data = state.data();
    let rollback = data.settings.cli_paths.clone();
    data.settings.cli_paths.set_manual(agent, path);
    let paths = data.settings.cli_paths.clone();
    if let Err(error) = state.save_locked(&data) {
        data.settings.cli_paths = rollback;
        return Err(error);
    }
    Ok(paths)
}

/// 探测全部 CLI 并写回设置，返回新缓存与可用性状态。
///
/// 探测会 fork `where.exe` 等子进程，属于耗时操作，因此放在锁外先算好，
/// 再短暂持锁写入。
pub fn probe_and_store(state: &Store) -> Result<(CliPaths, editor::CliAgentStatus), String> {
    let automatic_paths: Vec<(cli_probe::CliAgent, Option<String>)> = cli_probe::CliAgent::ALL
        .iter()
        .map(|agent| (*agent, None))
        .collect();
    let resolved = cli_probe::resolve_all(&automatic_paths);
    let available: Vec<(cli_probe::CliAgent, bool)> = resolved
        .iter()
        .map(|(agent, result)| (*agent, result.is_available()))
        .collect();
    let detected: Vec<(cli_probe::CliAgent, String)> = resolved
        .iter()
        .map(|(agent, result)| (*agent, result.path_text()))
        .collect();
    let probed_at = crate::model::now_ms() as u64;

    let stored_paths = {
        let mut data = state.data();
        let snapshot = data.settings.cli_paths.clone();
        data.settings.cli_paths.probed_at = probed_at;
        for (agent, value) in &detected {
            data.settings.cli_paths.set(*agent, value.clone());
        }
        let stored = data.settings.cli_paths.clone();
        if let Err(error) = state.save_locked(&data) {
            data.settings.cli_paths = snapshot;
            return Err(error);
        }
        stored
    };

    let is_available = |agent| {
        stored_paths
            .manual(agent)
            .map(|path| std::path::Path::new(path).is_file())
            .unwrap_or_else(|| {
                available
                    .iter()
                    .any(|(candidate, ok)| *candidate == agent && *ok)
            })
    };
    let status = editor::CliAgentStatus {
        codex: is_available(cli_probe::CliAgent::Codex),
        claude: is_available(cli_probe::CliAgent::Claude),
        omp: is_available(cli_probe::CliAgent::Omp),
        opencode: is_available(cli_probe::CliAgent::Opencode),
    };
    Ok((stored_paths, status))
}

/// 保存设置。
///
/// 快捷键变更会先尝试注册：注册失败则整体回滚并返回错误，
/// 避免出现「设置已保存但快捷键实际不可用」的不一致状态。
///
/// 读旧值、写新值、回滚三步必须在**同一次持锁**内完成，否则并发保存会
/// 互相覆盖；快捷键注册（系统调用，可能耗时）则刻意放在锁外执行。
#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<Store>,
    mut settings: AppSettings,
) -> Result<AppSettings, String> {
    settings.normalize();
    // 第一步：读取旧值并判断是否需要换快捷键（短暂持锁）。
    let previous = state.data().settings.clone();
    let toggle_changed = settings.global_hotkey != previous.global_hotkey;
    let quick_changed = settings.quick_hotkey != previous.quick_hotkey;
    let hotkey_changed = toggle_changed || quick_changed;

    // 第二步：锁外注册快捷键，避免系统调用阻塞其他命令。
    if hotkey_changed {
        let status = hotkey::register_all(&app, &settings.global_hotkey, &settings.quick_hotkey)?;
        // 主窗口快捷键是核心能力，注册失败必须拒绝保存；
        // 快速启动快捷键冲突只提示，不阻断保存（用户可能只是想禁用）。
        if !status.toggle_registered {
            let _ = hotkey::register_all(&app, &previous.global_hotkey, &previous.quick_hotkey);
            return Err(format!(
                "主窗口快捷键注册失败：{}",
                status
                    .toggle_error
                    .unwrap_or_else(|| "可能已被其他程序占用".into())
            ));
        }
        if quick_changed && status.quick_error.is_some() {
            let _ = hotkey::register_all(&app, &previous.global_hotkey, &previous.quick_hotkey);
            return Err(format!(
                "快速启动快捷键注册失败：{}",
                status.quick_error.unwrap_or_default()
            ));
        }
    }

    // 第三步：写入并落盘，全程持锁，失败时在同一把锁内回滚。
    {
        let mut data = state.data();
        // 锁内重新读取，避免使用上面那份可能已过期的快照做回滚。
        let rollback = data.settings.clone();
        data.settings = settings.clone();

        if let Err(error) = state.save_locked(&data) {
            data.settings = rollback;
            drop(data);
            if hotkey_changed {
                let _ = hotkey::register_all(&app, &previous.global_hotkey, &previous.quick_hotkey);
            }
            return Err(error);
        }
    }

    // 托盘菜单里不含设置内容，但最近列表可能与磁盘状态不同步，
    // 这里刷新一次成本极低，可保持两者一致。
    tray::rebuild_menu(&app);
    Ok(settings)
}

//! `Store`：数据文件的持有者与访问入口。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use super::data::AppData;
use serde::Serialize;

/// 当前应用的数据目录名。
const APP_DIR: &str = "agent-folder";

/// 旧版本使用的数据目录名；`load` 时会把其中的数据迁移过来。
const LEGACY_APP_DIR: &str = "vscode-folder-opener";

/// 数据文件所在目录：`%APPDATA%/agent-folder`。
pub fn data_dir() -> PathBuf {
    appdata_root().join(APP_DIR)
}

/// 旧版本数据目录：`%APPDATA%/vscode-folder-opener`。
fn legacy_data_dir() -> PathBuf {
    appdata_root().join(LEGACY_APP_DIR)
}

fn appdata_root() -> PathBuf {
    std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// 数据文件的完整路径，便于日志与「打开所在目录」功能复用。
pub fn store_path() -> PathBuf {
    data_dir().join("data.json")
}

/// 可恢复或受保护的数据加载状态。
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub warning: Option<String>,
    pub backup_path: Option<String>,
    pub read_only: bool,
}

/// 全局共享的应用状态。
///
/// 通过 `tauri::Manager::manage` 注入，命令层以 `State<Store>` 取得。
pub struct Store {
    path: PathBuf,
    pub data: Mutex<AppData>,
    status: Mutex<StorageStatus>,
}

impl Store {
    /// 从磁盘加载；读取异常时保留错误状态，禁止后续写入覆盖原文件。
    pub fn load() -> Self {
        let path = store_path();
        let mut status = StorageStatus::default();
        if let Some(dir) = path.parent() {
            if let Err(error) = fs::create_dir_all(dir) {
                status = StorageStatus {
                    warning: Some(format!("无法创建数据目录：{error}")),
                    backup_path: None,
                    read_only: true,
                };
            }
        }

        if !path.exists() && !status.read_only {
            if let Err(error) = migrate_legacy_data(&path) {
                status = StorageStatus {
                    warning: Some(format!("迁移旧数据失败：{error}")),
                    backup_path: None,
                    read_only: true,
                };
            }
        }

        let (mut data, loaded_status) = load_data(&path);
        if loaded_status.warning.is_some() {
            status = loaded_status;
        }

        // 旧版本数据没有 schema 版本，这里与 kind 一起补全并落盘。
        let migrated_schema = migrate_schema(&mut data);
        let backfilled = backfill_kinds(&mut data);
        let store = Self {
            path,
            data: Mutex::new(data),
            status: Mutex::new(status),
        };

        if (migrated_schema || backfilled) && !store.status().read_only {
            if let Err(error) = store.save() {
                eprintln!("数据格式迁移失败：{error}");
            }
        }

        store
    }

    /// 返回启动时的数据恢复/保护状态。
    pub fn status(&self) -> StorageStatus {
        self.status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn backup_path(&self) -> Option<PathBuf> {
        self.status().backup_path.map(PathBuf::from)
    }

    pub fn recover_backup(&self) -> Result<usize, String> {
        let backup = self
            .backup_path()
            .ok_or_else(|| "当前没有可恢复的数据备份".to_string())?;
        let raw = fs::read_to_string(&backup).map_err(|e| format!("读取备份失败：{e}"))?;
        let mut recovered: AppData = serde_json::from_str(&raw)
            .map_err(|e| format!("备份文件无法解析，原数据未更改：{e}"))?;
        if recovered.schema_version > super::data::CURRENT_SCHEMA_VERSION {
            return Err("备份数据来自更新版本的应用，当前版本不能安全恢复".into());
        }
        migrate_schema(&mut recovered);
        backfill_kinds(&mut recovered);
        let count = recovered.folders.len();
        let json = serde_json::to_string_pretty(&recovered).map_err(|e| e.to_string())?;
        let mut data = self.data();
        write_atomic(&self.path, json.as_bytes())?;
        *data = recovered;
        *self
            .status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = StorageStatus::default();
        Ok(count)
    }

    pub fn export_backup(&self, destination: &Path) -> Result<(), String> {
        let backup = self
            .backup_path()
            .ok_or_else(|| "当前没有可导出的数据备份".to_string())?;
        let contents = fs::read(&backup).map_err(|e| format!("读取备份失败：{e}"))?;
        write_atomic(destination, &contents)
    }
    pub fn reload(&self) -> Result<usize, String> {
        let (mut data, status) = load_data(&self.path);
        if let Some(warning) = status.warning.clone() {
            *self
                .status
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = status;
            return Err(warning);
        }
        let migrated_schema = migrate_schema(&mut data);
        let backfilled = backfill_kinds(&mut data);
        let count = data.folders.len();
        let mut current = self.data();
        if migrated_schema || backfilled {
            let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
            write_atomic(&self.path, json.as_bytes())?;
        }
        *current = data;
        *self
            .status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = StorageStatus::default();
        Ok(count)
    }

    /// 原子化保存：先写临时文件再替换，避免中途崩溃留下半个 JSON。
    pub fn save(&self) -> Result<(), String> {
        let data = self.data();
        self.save_locked(&data)
    }

    /// 在**已持有锁**的前提下保存，供 `mutate_and_save` 避免二次加锁。
    ///
    /// 两次加锁会在「修改」与「存盘」之间留下窗口期，导致并发写入互相覆盖；
    /// 调用方必须保证 `data` 来自本 Store 的锁。
    pub fn save_locked(&self, data: &AppData) -> Result<(), String> {
        let status = self.status();
        if status.read_only {
            return Err(status
                .warning
                .unwrap_or_else(|| "数据处于只读保护状态，拒绝写入".into()));
        }
        let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;

        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(|e| format!("写入数据失败：{e}"))?;
        fs::rename(&tmp, &self.path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("替换数据文件失败：{e}")
        })
    }

    /// 获取数据锁，容忍「锁中毒」。
    /// 默认的 `lock().unwrap()` 有一个致命问题：只要有任何一处代码在持锁
    /// 期间 panic，互斥锁就会被标记为中毒，此后**每一次**访问都会 panic，
    /// 整个应用进入永久失效状态，只能重启。
    ///
    /// 这里改用 `unwrap_or_else(PoisonError::into_inner)`：即使发生过
    /// panic，也继续使用内部数据。数据本身可能处于半更新状态，但这远好于
    /// 让应用完全不可用——用户至少还能看到列表并导出备份。
    pub fn data(&self) -> std::sync::MutexGuard<'_, AppData> {
        self.data
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// 测试专用：用指定路径与初始数据构造 Store。
    #[cfg(test)]
    pub fn for_test(path: std::path::PathBuf, data: AppData) -> Self {
        Self {
            path,
            data: Mutex::new(data),
            status: Mutex::new(StorageStatus::default()),
        }
    }

    /// 基准测试专用构造器（与 `for_test` 同义，语义更清晰）。
    #[cfg(test)]
    pub fn for_bench(path: std::path::PathBuf, data: AppData) -> Self {
        Self::for_test(path, data)
    }
}

fn write_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let name = path.file_name().ok_or_else(|| "目标路径无效".to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let suffix = format!("{}-{stamp}", std::process::id());
    let temporary = parent.join(format!(".{}.{}.tmp", name.to_string_lossy(), suffix));
    let backup = parent.join(format!(".{}.{}.bak", name.to_string_lossy(), suffix));

    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| format!("创建临时文件失败：{e}"))?;
    if let Err(error) = file.write_all(contents).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("写入临时文件失败：{error}"));
    }
    drop(file);

    let had_target = match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => {
            if let Err(error) = fs::rename(path, &backup) {
                let _ = fs::remove_file(&temporary);
                return Err(format!("无法保留原文件：{error}"));
            }
            true
        }
        Ok(_) => {
            let _ = fs::remove_file(&temporary);
            return Err("目标已存在但不是普通文件".into());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(format!("检查目标文件失败：{error}"));
        }
    };

    if let Err(error) = fs::rename(&temporary, path) {
        if had_target {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("替换文件失败：{error}"));
    }
    if had_target {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

/// 读取数据文件，并返回是否需要保护写入。
fn load_data(path: &std::path::Path) -> (AppData, StorageStatus) {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return (AppData::default(), StorageStatus::default());
        }
        Err(error) => {
            return (
                AppData::default(),
                StorageStatus {
                    warning: Some(format!("无法读取数据文件：{error}，已启用只读保护")),
                    backup_path: None,
                    read_only: true,
                },
            );
        }
    };

    match serde_json::from_str::<AppData>(&raw) {
        Ok(data) if data.schema_version > super::data::CURRENT_SCHEMA_VERSION => (
            data.clone(),
            StorageStatus {
                warning: Some(format!(
                    "数据文件版本 {} 高于当前支持版本 {}，已启用只读保护；请升级应用后再修改数据",
                    data.schema_version,
                    super::data::CURRENT_SCHEMA_VERSION
                )),
                backup_path: None,
                read_only: true,
            },
        ),
        Ok(data) => (data, StorageStatus::default()),
        Err(error) => {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = path.with_extension(format!("corrupt-{stamp}.json"));
            match fs::rename(path, &backup) {
                Ok(()) => {
                    eprintln!("数据文件解析失败，原文件已备份：{error}");
                    (
                        AppData::default(),
                        StorageStatus {
                            warning: Some(
                                "数据文件损坏，已保留原文件并创建备份；当前使用空数据启动".into(),
                            ),
                            backup_path: Some(backup.display().to_string()),
                            read_only: false,
                        },
                    )
                }
                Err(backup_error) => {
                    eprintln!("数据文件解析失败，创建备份失败：{backup_error}");
                    (
                        AppData::default(),
                        StorageStatus {
                            warning: Some(format!(
                                "数据文件损坏且无法创建备份：{backup_error}，已启用只读保护"
                            )),
                            backup_path: None,
                            read_only: true,
                        },
                    )
                }
            }
        }
    }
}

/// 把旧数据目录里的 `data.json` 复制到新位置。
///
/// 采用「复制」而非「移动」，这样即使新版本出现问题，
/// 用户回退旧版本时历史记录依然在。
fn migrate_legacy_data(target: &std::path::Path) -> Result<bool, String> {
    let legacy = legacy_data_dir().join("data.json");
    if !legacy.exists() {
        return Ok(false);
    }
    fs::copy(&legacy, target)
        .map(|_| true)
        .map_err(|error| format!("无法复制旧数据文件：{error}"))
}

fn migrate_schema(data: &mut AppData) -> bool {
    if data.schema_version == 0 {
        data.schema_version = super::data::CURRENT_SCHEMA_VERSION;
        true
    } else {
        false
    }
}

/// 加载时校正记录的 `kind`；返回是否有改动。
///
/// 每次启动都重新比对一次识别结果，理由有二：
/// 1. 旧版本数据没有该字段，需要补齐；
/// 2. 识别规则本身可能改进（例如新增 Tauri 判定），旧结果需要纠正。
///
/// 只在结果确实不同时才写盘，避免无意义的文件写入。
fn backfill_kinds(data: &mut AppData) -> bool {
    use crate::services::project;

    let mut changed = false;
    for record in data.folders.iter_mut() {
        let detected = project::detect(&record.path).map(|k| k.id.to_string());
        if record.kind != detected {
            record.kind = detected;
            changed = true;
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::load_data;
    use crate::storage::AppData;

    /// 建一个只属于当前测试的临时目录，避免并发测试互相干扰。
    ///
    /// 放在 `target/` 下而非系统临时目录：构建目录始终可写，
    /// 且会随 `cargo clean` 一起清理。
    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-scratch")
            .join(format!("{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("无法创建测试目录");
        dir
    }

    #[test]
    fn missing_file_falls_back_to_defaults() {
        let dir = temp_dir("missing");
        let (data, status) = load_data(&dir.join("data.json"));
        assert!(data.folders.is_empty());
        assert!(!status.read_only);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_file_is_backed_up_not_overwritten() {
        let dir = temp_dir("corrupt");
        let path = dir.join("data.json");
        std::fs::write(&path, "{ this is not valid json").unwrap();

        let (data, status) = load_data(&path);
        assert!(data.folders.is_empty(), "解析失败应回退到默认值");
        assert!(!status.read_only);
        assert!(status.backup_path.is_some(), "应返回可恢复备份路径");

        // 原文件必须已被改名保留，而不是留在原地等待被覆盖。
        assert!(!path.exists(), "损坏文件应被移走");
        let backups: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains("corrupt"))
            .collect();
        assert_eq!(backups.len(), 1, "应生成恰好一个备份文件");

        let saved = std::fs::read_to_string(backups[0].path()).unwrap();
        assert!(saved.contains("not valid json"), "备份内容应与原文件一致");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restores_valid_backup_and_clears_warning() {
        let dir = temp_dir("recover");
        let path = dir.join("data.json");
        let backup = dir.join("data.corrupt.json");
        let mut recovered = AppData::default();
        let record = recovered.add_folder("C:\\Recovered");
        recovered.folders[0].favorite = true;
        let raw = serde_json::to_string(&recovered).unwrap();
        std::fs::write(&backup, raw).unwrap();
        let store = super::Store {
            path: path.clone(),
            data: std::sync::Mutex::new(AppData::default()),
            status: std::sync::Mutex::new(super::StorageStatus {
                warning: Some("corrupt".into()),
                backup_path: Some(backup.display().to_string()),
                read_only: false,
            }),
        };

        assert_eq!(store.recover_backup().unwrap(), 1);
        assert_eq!(store.data().folders[0].id, record.id);
        assert!(store.data().folders[0].favorite);
        assert!(path.exists());
        assert!(backup.exists(), "恢复后保留原始备份以便回滚");
        assert!(store.status().warning.is_none());
        assert!(!store.status().read_only);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn invalid_backup_does_not_replace_data_file() {
        let dir = temp_dir("bad-backup");
        let path = dir.join("data.json");
        let backup = dir.join("data.corrupt.json");
        std::fs::write(&path, "existing").unwrap();
        std::fs::write(&backup, "invalid").unwrap();
        let store = super::Store {
            path: path.clone(),
            data: std::sync::Mutex::new(AppData::default()),
            status: std::sync::Mutex::new(super::StorageStatus {
                warning: Some("corrupt".into()),
                backup_path: Some(backup.display().to_string()),
                read_only: false,
            }),
        };

        assert!(store.recover_backup().is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "existing");
        assert!(store.status().warning.is_some());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reload_reads_external_changes() {
        let dir = temp_dir("reload");
        let path = dir.join("data.json");
        std::fs::write(&path, r#"{"folders":[],"settings":{}}"#).unwrap();
        let store = super::Store::for_test(path.clone(), AppData::default());
        let mut disk = AppData::default();
        disk.add_folder("C:\\Reloaded");
        std::fs::write(&path, serde_json::to_string(&disk).unwrap()).unwrap();

        assert_eq!(store.reload().unwrap(), 1);
        assert_eq!(store.data().folders[0].path, "C:\\Reloaded");
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn future_schema_is_read_only() {
        let dir = temp_dir("future-schema");
        let path = dir.join("data.json");
        std::fs::write(&path, r#"{"schemaVersion":999,"folders":[],"settings":{}}"#).unwrap();

        let (data, status) = load_data(&path);
        assert_eq!(data.schema_version, 999);
        assert!(status.read_only);
        assert!(status.warning.unwrap().contains("高于当前支持版本"));
        assert!(path.exists());
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn read_error_enables_write_protection() {
        let dir = temp_dir("read-error");
        let path = dir.join("data.json");
        std::fs::create_dir(&path).unwrap();

        let (data, status) = load_data(&path);
        assert!(data.folders.is_empty());
        assert!(status.read_only);
        assert!(status.warning.is_some());

        let store = super::Store {
            path,
            data: std::sync::Mutex::new(data),
            status: std::sync::Mutex::new(status),
        };
        assert!(store.save().is_err(), "读取异常后必须拒绝写入");
        assert!(store.path.is_dir(), "原始路径不得被覆盖");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn valid_file_round_trips() {
        let dir = temp_dir("valid");
        let path = dir.join("data.json");
        std::fs::write(
            &path,
            r#"{"folders":[{"id":"a","path":"C:\\x","name":"x"}]}"#,
        )
        .unwrap();

        let (data, status) = load_data(&path);
        assert_eq!(data.folders.len(), 1);
        assert_eq!(data.folders[0].id, "a");
        assert!(!status.read_only);
        assert!(path.exists(), "有效文件不应被移动");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn appdata_default_is_usable() {
        // 确保默认值可序列化，避免保存时 panic。
        let json = serde_json::to_string(&AppData::default()).unwrap();
        assert!(json.contains("settings"));
    }

    #[test]
    fn poisoned_lock_still_allows_access() {
        // 模拟「某个命令在持锁期间 panic」导致互斥锁中毒。
        let store = super::Store {
            path: std::path::PathBuf::from("unused.json"),
            data: std::sync::Mutex::new(AppData::default()),
            status: std::sync::Mutex::new(super::StorageStatus::default()),
        };

        let poisoned = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = store.data.lock().unwrap();
            panic!("模拟持锁期间 panic");
        }));
        assert!(poisoned.is_err(), "应当捕获到 panic");
        assert!(store.data.is_poisoned(), "锁应处于中毒状态");

        // 关键断言：中毒后仍能读写，而不是让整个应用永久失效。
        let mut guard = store.data();
        guard.add_folder("C:\\Still\\Works");
        assert_eq!(guard.folders.len(), 1);
        drop(guard);

        assert_eq!(store.data().folders.len(), 1);
    }
}

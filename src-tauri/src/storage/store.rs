//! `Store`：数据文件的持有者与访问入口。

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use super::data::AppData;

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

/// 全局共享的应用状态。
///
/// 通过 `tauri::Manager::manage` 注入，命令层以 `State<Store>` 取得。
pub struct Store {
    path: PathBuf,
    pub data: Mutex<AppData>,
}

impl Store {
    /// 从磁盘加载；文件缺失或损坏时退回默认值，保证应用总能启动。
    pub fn load() -> Self {
        let path = store_path();
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }

        // 改名后首次启动：把旧目录的数据搬过来，避免历史记录丢失。
        if !path.exists() {
            migrate_legacy_data(&path);
        }

        let mut data = load_data(&path);

        // 旧版本数据没有 `kind` 字段，这里补测一次并落盘，
        // 使升级后的首次启动就能显示项目徽标。
        let backfilled = backfill_kinds(&mut data);

        let store = Self {
            path,
            data: Mutex::new(data),
        };

        if backfilled {
            let _ = store.save();
        }

        store
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
        }
    }

    /// 基准测试专用构造器（与 `for_test` 同义，语义更清晰）。
    #[cfg(test)]
    pub fn for_bench(path: std::path::PathBuf, data: AppData) -> Self {
        Self::for_test(path, data)
    }
}

/// 读取数据文件；解析失败时保留原文件并回退到默认值。
///
/// 关键点：解析失败**不能**让后续 `save()` 覆盖掉用户的原始文件。
/// 这里先把损坏文件改名备份，再返回默认值，这样用户仍有机会
/// 从备份里手工抢救数据，而不是被静默清空。
fn load_data(path: &std::path::Path) -> AppData {
    let Ok(raw) = fs::read_to_string(path) else {
        // 文件不存在属正常情况（首次启动）。
        return AppData::default();
    };

    match serde_json::from_str::<AppData>(&raw) {
        Ok(data) => data,
        Err(error) => {
            eprintln!("数据文件解析失败，已备份原文件：{error}");
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = path.with_extension(format!("corrupt-{stamp}.json"));
            let _ = fs::rename(path, &backup);
            AppData::default()
        }
    }
}

/// 把旧数据目录里的 `data.json` 复制到新位置。
///
/// 采用「复制」而非「移动」，这样即使新版本出现问题，
/// 用户回退旧版本时历史记录依然在。
fn migrate_legacy_data(target: &std::path::Path) -> bool {
    let legacy = legacy_data_dir().join("data.json");
    if !legacy.exists() {
        return false;
    }
    fs::copy(&legacy, target).is_ok()
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
        let data = load_data(&dir.join("data.json"));
        assert!(data.folders.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_file_is_backed_up_not_overwritten() {
        let dir = temp_dir("corrupt");
        let path = dir.join("data.json");
        std::fs::write(&path, "{ this is not valid json").unwrap();

        let data = load_data(&path);
        assert!(data.folders.is_empty(), "解析失败应回退到默认值");

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
    fn valid_file_round_trips() {
        let dir = temp_dir("valid");
        let path = dir.join("data.json");
        std::fs::write(
            &path,
            r#"{"folders":[{"id":"a","path":"C:\\x","name":"x"}]}"#,
        )
        .unwrap();

        let data = load_data(&path);
        assert_eq!(data.folders.len(), 1);
        assert_eq!(data.folders[0].id, "a");
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

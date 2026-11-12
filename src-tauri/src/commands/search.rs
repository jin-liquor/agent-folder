//! 搜索相关命令：磁盘索引的构建编排、查询与状态。
//!
//! 索引的纯逻辑在 [`crate::services::index`]，这里只负责：
//! 读设置、起后台线程、把状态与命中返回给前端。
//! 线程编排放在命令层，是为了让服务层保持无 `tauri` 依赖、可单独测试。

use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use crate::model::now_ms;
use crate::services::index::{self, IndexStatus, SearchOutcome, MAX_DEPTH};
use crate::services::scanner;
use crate::storage::{index_cache, Store};

/// 旧扫描接口的结果上限，保留兼容。
const SCAN_LIMIT: usize = 60;

/// 索引查询默认上限。
const DEFAULT_SEARCH_LIMIT: usize = 40;

/// 后台刷新间隔：10 分钟。
///
/// 构建本身不阻塞查询（旧快照继续可用），所以这个频率足够便宜；
/// 真正的新鲜度靠「打开即入库」和手动重建兜底。
const REFRESH_INTERVAL: Duration = Duration::from_secs(600);

/// 启动时装配索引：先同步装载缓存（首屏即可搜索），再决定是否后台重建。
pub fn bootstrap_index(app: AppHandle) {
    spawn_index_build(app.clone(), false);
    spawn_refresh_loop(app);
}

/// 起一次索引构建。
///
/// `force = false` 时先尝试读取缓存：指纹一致且未过期则直接返回，
/// 这一步是**同步**的，保证快速启动窗口第一次打开就能搜到结果。
pub fn spawn_index_build(app: AppHandle, force: bool) {
    let (enabled, roots) = {
        let store = app.state::<Store>();
        let data = store.data();
        (
            data.settings.scan_enabled,
            data.settings.search_roots.clone(),
        )
    };

    if !enabled {
        app.state::<index::IndexStore>().disable();
        return;
    }
    if roots.iter().all(|root| root.trim().is_empty()) {
        app.state::<index::IndexStore>().disable();
        return;
    }

    let fingerprint = index_cache::fingerprint(&roots, MAX_DEPTH);

    if !force {
        if let Some(cached) = index_cache::load(&index_cache::path()) {
            if cached.fingerprint == fingerprint {
                let fresh = now_ms() - cached.built_at < index::CACHE_TTL_MS;
                let installed = app.state::<index::IndexStore>().install_cache(cached);
                if installed && fresh {
                    return;
                }
            }
        }
    }

    let cancel = app.state::<index::IndexStore>().begin(roots.clone());
    let Some(cancel) = cancel else {
        // 已有构建在跑，本次跳过；下一轮刷新会补上。
        return;
    };

    let builder = std::thread::Builder::new().name("disk-index".into());
    let worker = app.clone();
    let spawned = builder.spawn(move || {
        let index = worker.state::<index::IndexStore>();
        let outcome = index::build(&roots, MAX_DEPTH, &cancel, &|scanned| {
            index.set_scanned(scanned);
        });

        let built_at = now_ms();
        let cache = outcome.to_cache(fingerprint.clone(), built_at);
        index.finish(outcome, built_at);

        if let Err(error) = index_cache::save(&index_cache::path(), &cache) {
            // 缓存写不进去只影响下次启动速度，不影响本次结果。
            eprintln!("保存磁盘索引失败：{error}");
        }
    });

    if let Err(error) = spawned {
        app.state::<index::IndexStore>()
            .fail(Some(format!("无法启动索引线程：{error}")));
    }
}

/// 周期性后台刷新：索引陈旧或磁盘新增目录时自动追上。
fn spawn_refresh_loop(app: AppHandle) {
    let builder = std::thread::Builder::new().name("disk-index-refresh".into());
    let _ = builder.spawn(move || loop {
        std::thread::sleep(REFRESH_INTERVAL);
        spawn_index_build(app.clone(), true);
    });
}

/// 在索引中检索（纯内存，不再遍历磁盘）。
#[tauri::command]
pub fn search_index(
    index: State<'_, index::IndexStore>,
    query: String,
    limit: Option<usize>,
) -> SearchOutcome {
    index.search(&query, limit.unwrap_or(DEFAULT_SEARCH_LIMIT).clamp(1, 200))
}

/// 读取索引状态，用于设置页与浮窗的进度展示。
#[tauri::command]
pub fn get_index_status(index: State<'_, index::IndexStore>) -> IndexStatus {
    index.status()
}

/// 强制重建索引，立即返回当前状态（进度通过 `get_index_status` 轮询）。
#[tauri::command]
pub fn rebuild_index(app: AppHandle) -> IndexStatus {
    spawn_index_build(app.clone(), true);
    app.state::<index::IndexStore>().status()
}

/// 旧接口：按名称实时扫描磁盘。
///
/// 索引上线后前端不再调用它；保留一版用于降级与对照测试，
/// 计划在下个大版本移除。
#[tauri::command]
pub async fn scan_folders(state: State<'_, Store>, query: String) -> Result<Vec<String>, String> {
    let (enabled, roots) = {
        let data = state.data();
        (
            data.settings.scan_enabled,
            data.settings.search_roots.clone(),
        )
    };
    if !enabled {
        return Ok(Vec::new());
    }

    tauri::async_runtime::spawn_blocking(move || Ok(scanner::scan(&roots, &query, SCAN_LIMIT)))
        .await
        .map_err(|e| e.to_string())?
}

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

/// 自动索引的检查节奏：每 20 秒读一次设置，判断是否需要重建。
///
/// 用「上次尝试时间」而不是「上次成功构建时间」判断间隔：
/// 构建失败时 `built_at` 不会前进，按成功时间判断会导致每轮都重试、把磁盘打满。
const AUTO_REFRESH_TICK: Duration = Duration::from_secs(20);

/// 是否该执行一次自动重建（纯函数，便于测试）。
///
/// - `scan_enabled`：用户在设置里关闭磁盘搜索时不再自动重建；
/// - `auto`：自动索引开关；
/// - `interval_minutes`：设置的间隔，非法值按 `DEFAULT_INDEX_REFRESH_MINUTES` 处理；
/// - `building`：已有构建在跑时不重复触发；
/// - `elapsed_ms`：距离上次尝试的毫秒数。
pub fn should_auto_refresh(
    scan_enabled: bool,
    auto: bool,
    interval_minutes: u32,
    building: bool,
    elapsed_ms: i64,
) -> bool {
    if !scan_enabled || !auto || building {
        return false;
    }
    let minutes = if crate::model::INDEX_REFRESH_MINUTES.contains(&interval_minutes) {
        interval_minutes
    } else {
        crate::model::DEFAULT_INDEX_REFRESH_MINUTES
    };
    elapsed_ms >= i64::from(minutes) * 60_000
}

/// 启动时装配索引：先同步装载缓存（首屏即可搜索），再决定是否后台重建。
pub fn bootstrap_index(app: AppHandle) {
    spawn_index_build(app.clone(), false);
    spawn_auto_refresh_loop(app);
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

    let Some(handle) = app.state::<index::IndexStore>().begin(roots.clone()) else {
        // 已有构建在跑，本次跳过；下一轮刷新会补上。
        return;
    };
    let cancel = handle.cancel.clone();
    let generation = handle.generation;

    let builder = std::thread::Builder::new().name("disk-index".into());
    let worker = app.clone();
    let spawned = builder.spawn(move || {
        let index = worker.state::<index::IndexStore>();
        let outcome = index::build(&roots, MAX_DEPTH, &cancel, &|scanned| {
            index.set_scanned(scanned, generation);
        });

        // 构建被取消时拿到的是半截结果：既不提交快照，也不写入缓存。
        // 否则关掉磁盘搜索后索引会「复活」，下次启动还会直接加载这份残缺缓存。
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            index.abort(generation);
            return;
        }

        let built_at = now_ms();
        let cache = outcome.to_cache(fingerprint.clone(), built_at);
        if !index.finish(outcome, built_at, generation) {
            // 已有更新的构建接手，本次结果作废。
            return;
        }

        if let Err(error) = index_cache::save(&index_cache::path(), &cache) {
            // 缓存写不进去只影响下次启动速度，不影响本次结果。
            eprintln!("保存磁盘索引失败：{error}");
        }
    });

    if let Err(error) = spawned {
        app.state::<index::IndexStore>()
            .fail(Some(format!("无法启动索引线程：{error}")), generation);
    }
}

/// 设置驱动的后台自动重建：每 [`AUTO_REFRESH_TICK`] 读一次设置，判断是否到期。
///
/// 设置在这里现读，用户改完间隔或关掉开关后无需重启即可生效。
fn spawn_auto_refresh_loop(app: AppHandle) {
    let builder = std::thread::Builder::new().name("disk-index-auto".into());
    let _ = builder.spawn(move || {
        let mut last_attempt = std::time::Instant::now();
        loop {
            std::thread::sleep(AUTO_REFRESH_TICK);
            let (scan_enabled, auto, minutes) = {
                let store = app.state::<Store>();
                let data = store.data();
                (
                    data.settings.scan_enabled,
                    data.settings.index_auto_refresh,
                    data.settings.index_refresh_minutes,
                )
            };
            let building = app.state::<index::IndexStore>().status().building;
            let elapsed = last_attempt.elapsed().as_millis() as i64;
            if should_auto_refresh(scan_enabled, auto, minutes, building, elapsed) {
                // 先记时间再起构建：即便构建很快失败，也不会每轮都重试。
                last_attempt = std::time::Instant::now();
                spawn_index_build(app.clone(), true);
            }
        }
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

#[cfg(test)]
mod tests {
    use super::should_auto_refresh;

    /// 默认间隔（30 分钟）对应的毫秒数。
    const DEFAULT_MS: i64 = 30 * 60_000;

    #[test]
    fn disabled_states_never_refresh() {
        // 关闭磁盘搜索：无论过了多久都不重建。
        assert!(!should_auto_refresh(false, true, 30, false, i64::MAX));
        // 关闭自动索引开关。
        assert!(!should_auto_refresh(true, false, 30, false, i64::MAX));
        // 已有构建在跑：不重复触发。
        assert!(!should_auto_refresh(true, true, 30, true, i64::MAX));
    }

    #[test]
    fn interval_boundary_is_inclusive() {
        assert!(!should_auto_refresh(true, true, 30, false, DEFAULT_MS - 1));
        assert!(should_auto_refresh(true, true, 30, false, DEFAULT_MS));
        assert!(should_auto_refresh(true, true, 30, false, DEFAULT_MS + 1));
    }

    #[test]
    fn interval_follows_the_configured_value() {
        // 15 分钟档位比 30 分钟更早触发；24 小时档位要等满一天。
        assert!(should_auto_refresh(true, true, 15, false, 15 * 60_000));
        assert!(!should_auto_refresh(true, true, 1440, false, 1439 * 60_000));
        assert!(should_auto_refresh(true, true, 1440, false, 1440 * 60_000));
    }

    #[test]
    fn invalid_interval_falls_back_to_default() {
        // 0 和 7 都不是合法档位，必须按默认 30 分钟计算，
        // 而不是退化成「每轮都重建」。
        for minutes in [0, 7] {
            assert!(
                !should_auto_refresh(true, true, minutes, false, DEFAULT_MS - 1),
                "{minutes} 应按默认 30 分钟计算"
            );
            assert!(
                should_auto_refresh(true, true, minutes, false, DEFAULT_MS),
                "{minutes} 应按默认 30 分钟计算"
            );
        }
    }
}

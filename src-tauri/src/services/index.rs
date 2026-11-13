//! 常驻磁盘索引。
//!
//! 目标：把「每次按键都遍历整盘」换成「启动时建一次、查询只读内存」。
//!
//! - 构建：[`build`] 用 `walkdir` 单遍遍历所有根目录，跳过依赖/产物/系统目录。
//! - 查询：[`search_entries`] 纯内存匹配 + 相关性排序，不触碰文件系统。
//! - 状态：由 [`IndexStore`] 持有，命令层通过它读取快照与构建进度。
//!
//! 本模块刻意不依赖 `tauri`：构建/查询都是纯函数，编排与线程放在命令层，
//! 这样索引逻辑可以单独测试。

use std::collections::HashSet;

use serde::Serialize;
use walkdir::{DirEntry, WalkDir};

use crate::model::display_name_of;
use crate::storage::index_cache::{CachedEntry, CachedIndex};

/// 索引最大深度，与旧扫描行为保持一致。
pub const MAX_DEPTH: usize = 4;

/// 条目上限。超过后停止构建并标记 `truncated`，避免超大磁盘吃光内存。
pub const MAX_ENTRIES: usize = 300_000;

/// 缓存有效期：超过后即使指纹一致也重建一次。
pub const CACHE_TTL_MS: i64 = 24 * 60 * 60 * 1000;

/// 构建时直接跳过的目录名（小写比较）。
///
/// 前一组是依赖与构建产物，后一组是 Windows 系统目录——后者对
/// 「找项目文件夹」没有价值，却往往占据整盘遍历的大部分时间。
const SKIP_DIR_NAMES: &[&str] = &[
    // 依赖与产物
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "out",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    ".cache",
    ".next",
    ".vs",
    "bin",
    "obj",
    ".pnpm-store",
    ".idea",
    // Windows 系统目录
    "windows",
    "winsxs",
    "program files",
    "program files (x86)",
    "programdata",
    "$recycle.bin",
    "system volume information",
    "recovery",
    "perflogs",
    "windows.old",
    "$windows.~bt",
    "$windows.~ws",
    "microsoft",
    "packages",
    "temp",
];

/// 一条索引记录。
#[derive(Debug, Clone)]
pub struct Entry {
    pub path: String,
    /// 小写名称，构建时算好，查询期零分配。
    pub name_lower: String,
    pub depth: u8,
    pub root: u8,
}

/// 一次查询的命中。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    pub depth: u8,
    pub score: i32,
}

/// 构建结果。
#[derive(Debug, Default)]
pub struct BuildOutcome {
    pub entries: Vec<Entry>,
    pub truncated: bool,
    pub warnings: Vec<String>,
}

impl BuildOutcome {
    /// 转成可落盘的缓存结构。
    pub fn to_cache(&self, fingerprint: String, built_at: i64) -> CachedIndex {
        CachedIndex {
            format_version: crate::storage::index_cache::FORMAT_VERSION,
            fingerprint,
            built_at,
            max_depth: MAX_DEPTH,
            entries: self
                .entries
                .iter()
                .map(|entry| CachedEntry {
                    path: entry.path.clone(),
                    depth: entry.depth,
                    root: entry.root,
                })
                .collect(),
            truncated: self.truncated,
            warnings: self.warnings.clone(),
        }
    }
}

/// 判断目录是否应跳过（根目录本身永远参与）。
fn is_skipped(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }
    // 符号链接 / junction 一律不进入：Windows 上可能成环或重复计数。
    if entry.file_type().is_symlink() {
        return true;
    }
    let name = entry.file_name().to_string_lossy();
    if name.starts_with('.') {
        return true;
    }
    let lower = name.to_lowercase();
    SKIP_DIR_NAMES.contains(&lower.as_str())
}

/// 遍历所有根目录，构建索引。
///
/// `cancel` 被置位时立刻返回已收集的部分结果；`progress` 每处理 512 个
/// 目录回调一次，用于驱动界面进度。
pub fn build(
    roots: &[String],
    max_depth: usize,
    cancel: &std::sync::atomic::AtomicBool,
    progress: &dyn Fn(usize),
) -> BuildOutcome {
    use std::sync::atomic::Ordering;

    let mut outcome = BuildOutcome::default();
    let mut seen: HashSet<String> = HashSet::new();
    let mut visited: usize = 0;

    'roots: for (index, root) in roots.iter().enumerate() {
        if root.trim().is_empty() {
            continue;
        }
        let root_path = std::path::Path::new(root);
        if !root_path.is_dir() {
            push_warning(&mut outcome.warnings, format!("扫描根不可访问：{root}"));
            continue;
        }

        let walker = WalkDir::new(root)
            .max_depth(max_depth)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| !is_skipped(entry));

        for item in walker {
            if cancel.load(Ordering::Relaxed) {
                break 'roots;
            }
            visited += 1;
            if visited % 512 == 0 {
                progress(outcome.entries.len());
            }

            let entry = match item {
                Ok(entry) => entry,
                Err(error) => {
                    // 权限不足、路径过长等在整盘扫描中很常见，计数即可，不中断。
                    push_warning(&mut outcome.warnings, error.to_string());
                    continue;
                }
            };
            if entry.depth() == 0 || !entry.file_type().is_dir() {
                continue;
            }

            let path = entry.path().to_string_lossy().to_string();
            let key = path.to_lowercase();
            if !seen.insert(key) {
                continue;
            }

            outcome.entries.push(Entry {
                path,
                name_lower: entry.file_name().to_string_lossy().to_lowercase(),
                depth: entry.depth().min(u8::MAX as usize) as u8,
                root: index.min(u8::MAX as usize) as u8,
            });
            if outcome.entries.len() >= MAX_ENTRIES {
                outcome.truncated = true;
                break 'roots;
            }
        }
    }

    progress(outcome.entries.len());
    outcome
}

/// 只保留前若干条告警，避免界面被刷屏。
fn push_warning(warnings: &mut Vec<String>, message: String) {
    const MAX_WARNINGS: usize = 5;
    if warnings.len() < MAX_WARNINGS {
        warnings.push(message);
    }
}

/// 相关性打分；返回 `None` 表示不匹配。
fn score(name: &str, needle: &str, depth: u8) -> Option<i32> {
    let position = name.find(needle)?;
    let base = if position == 0 {
        if name.len() == needle.len() {
            220
        } else {
            160
        }
    } else if is_word_start(name, position) {
        100
    } else {
        55
    };
    Some(base - i32::from(depth) * 3 - (position as i32) / 4)
}

/// `index` 前一个字符是否是分隔符（即命中处于「词首」）。
fn is_word_start(name: &str, index: usize) -> bool {
    match name[..index].chars().next_back() {
        Some(character) => matches!(character, '-' | '_' | '.' | ' ' | '(' | '['),
        None => true,
    }
}

/// 在内存条目中搜索，返回按相关性排序的前 `limit` 条。
pub fn search_entries(entries: &[Entry], query: &str, limit: usize) -> Vec<SearchHit> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() || limit == 0 {
        return Vec::new();
    }

    let mut scored: Vec<(i32, usize, &Entry)> = entries
        .iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            score(&entry.name_lower, &needle, entry.depth).map(|score| (score, index, entry))
        })
        .collect();

    let rank = |a: &(i32, usize, &Entry), b: &(i32, usize, &Entry)| {
        b.0.cmp(&a.0)
            .then_with(|| a.2.path.len().cmp(&b.2.path.len()))
            .then_with(|| a.1.cmp(&b.1))
    };
    if scored.len() > limit {
        scored.select_nth_unstable_by(limit, rank);
        scored.truncate(limit);
    }
    scored.sort_by(rank);

    scored
        .into_iter()
        .map(|(score, _, entry)| SearchHit {
            name: display_name_of(&entry.path),
            path: entry.path.clone(),
            depth: entry.depth,
            score,
        })
        .collect()
}

/// 索引运行状态，供命令层直接返回给前端。
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub ready: bool,
    pub building: bool,
    /// 已建立索引的条目数。
    pub entries: usize,
    /// 构建过程中已访问的目录数，用于进度展示。
    pub scanned: usize,
    pub built_at: i64,
    pub roots: Vec<String>,
    pub truncated: bool,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}

/// 一次查询的完整结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOutcome {
    pub ready: bool,
    pub building: bool,
    pub scanned: usize,
    pub entries: usize,
    pub hits: Vec<SearchHit>,
    pub truncated: bool,
    pub warnings: Vec<String>,
}

struct Inner {
    entries: Vec<Entry>,
    roots: Vec<String>,
    built_at: i64,
    truncated: bool,
    warnings: Vec<String>,
    ready: bool,
    building: bool,
    scanned: usize,
    error: Option<String>,
    cancel: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// 构建代号：每次 `begin` / `disable` 递增一次。
    ///
    /// 用来识别「过期的构建」：索引被关闭或重建后，先前那次构建的
    /// 线程仍会回来交结果，若不校验代号，半截结果就会覆盖新状态。
    generation: u64,
}

/// 一次构建的句柄：取消标志 + 构建代号。
#[derive(Debug, Clone)]
pub struct BuildHandle {
    /// 置位后构建应尽快停止。
    pub cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// 本次构建的代号，交回结果时用于校验是否仍然有效。
    pub generation: u64,
}

/// 应用级索引状态（通过 `manage` 注入）。
pub struct IndexStore {
    inner: std::sync::Mutex<Inner>,
}

impl Default for IndexStore {
    fn default() -> Self {
        Self::new()
    }
}

impl IndexStore {
    pub fn new() -> Self {
        Self {
            inner: std::sync::Mutex::new(Inner {
                entries: Vec::new(),
                roots: Vec::new(),
                built_at: 0,
                truncated: false,
                warnings: Vec::new(),
                ready: false,
                building: false,
                scanned: 0,
                error: None,
                cancel: None,
                generation: 0,
            }),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn status(&self) -> IndexStatus {
        let inner = self.lock();
        IndexStatus {
            ready: inner.ready,
            building: inner.building,
            entries: inner.entries.len(),
            scanned: inner.scanned,
            built_at: inner.built_at,
            roots: inner.roots.clone(),
            truncated: inner.truncated,
            warnings: inner.warnings.clone(),
            error: inner.error.clone(),
        }
    }

    /// 查询索引快照；索引未就绪时返回空命中，但仍带上状态供界面区分。
    pub fn search(&self, query: &str, limit: usize) -> SearchOutcome {
        let inner = self.lock();
        let hits = if inner.ready {
            search_entries(&inner.entries, query, limit)
        } else {
            Vec::new()
        };
        SearchOutcome {
            ready: inner.ready,
            building: inner.building,
            scanned: inner.scanned,
            entries: inner.entries.len(),
            hits,
            truncated: inner.truncated,
            warnings: inner.warnings.clone(),
        }
    }

    /// 直接装载缓存（启动时同步调用，保证首屏即可搜索）。
    pub fn install_cache(&self, cached: CachedIndex) -> bool {
        if cached.format_version != crate::storage::index_cache::FORMAT_VERSION {
            return false;
        }
        let entries = cached
            .entries
            .into_iter()
            .map(|entry| Entry {
                name_lower: display_name_of(&entry.path).to_lowercase(),
                path: entry.path,
                depth: entry.depth,
                root: entry.root,
            })
            .collect();
        let mut inner = self.lock();
        // 已有更新的快照时不要被旧缓存覆盖。
        if inner.ready && inner.built_at > cached.built_at {
            return false;
        }
        inner.entries = entries;
        inner.roots = Vec::new();
        inner.built_at = cached.built_at;
        inner.truncated = cached.truncated;
        inner.warnings = cached.warnings;
        inner.ready = true;
        inner.error = None;
        true
    }

    /// 开始一次构建；已有构建在跑时返回 `None`。
    ///
    /// 返回的 [`BuildHandle`] 携带构建代号，交回结果时用于校验有效性。
    pub fn begin(&self, roots: Vec<String>) -> Option<BuildHandle> {
        let mut inner = self.lock();
        if inner.building {
            return None;
        }
        let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        inner.generation += 1;
        inner.building = true;
        inner.scanned = 0;
        inner.roots = roots;
        inner.error = None;
        inner.cancel = Some(cancel.clone());
        Some(BuildHandle {
            cancel,
            generation: inner.generation,
        })
    }

    /// 汇报构建进度；代号不匹配说明本次构建已过期，进度不再写入。
    pub fn set_scanned(&self, scanned: usize, generation: u64) {
        let mut inner = self.lock();
        if inner.generation != generation {
            return;
        }
        inner.scanned = scanned;
    }

    /// 用构建结果替换快照。
    ///
    /// 返回 `false` 表示本次结果已过期（索引被关闭，或已有更新的构建接手），
    /// 调用方据此**不要**把这份不完整的结果落盘。
    pub fn finish(&self, outcome: BuildOutcome, built_at: i64, generation: u64) -> bool {
        let mut inner = self.lock();
        if inner.generation != generation {
            return false;
        }
        inner.entries = outcome.entries;
        inner.truncated = outcome.truncated;
        inner.warnings = outcome.warnings;
        inner.built_at = built_at;
        inner.ready = true;
        inner.building = false;
        inner.cancel = None;
        inner.error = None;
        true
    }

    /// 构建失败或扫描被关闭。
    pub fn fail(&self, error: Option<String>, generation: u64) {
        let mut inner = self.lock();
        if inner.generation != generation {
            return;
        }
        inner.building = false;
        inner.cancel = None;
        inner.error = error;
        if inner.error.is_some() {
            inner.ready = false;
        }
    }

    /// 构建被取消：只清理构建状态，不动已有快照。
    pub fn abort(&self, generation: u64) {
        let mut inner = self.lock();
        if inner.generation != generation {
            return;
        }
        inner.building = false;
        inner.cancel = None;
        inner.error = None;
    }

    /// 关闭磁盘搜索：停止构建并丢弃快照。
    pub fn disable(&self) {
        self.cancel_current();
        let mut inner = self.lock();
        // 代号递增：在途构建交回结果时会发现代号已变，从而丢弃半截结果，
        // 不会把「已关闭」的索引重新点亮，也不会写入残缺缓存。
        inner.generation += 1;
        inner.entries.clear();
        inner.roots.clear();
        inner.built_at = 0;
        inner.ready = false;
        inner.building = false;
        inner.cancel = None;
        inner.error = None;
        inner.truncated = false;
        inner.warnings.clear();
        inner.scanned = 0;
    }

    /// 让正在进行的构建尽快停止（用于重建或退出）。
    pub fn cancel_current(&self) {
        if let Some(cancel) = self.lock().cancel.clone() {
            cancel.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("index-tests")
            .join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("无法创建测试目录");
        dir
    }

    /// 按路径段创建目录。
    ///
    /// 逐段 `push` 而不是把整条路径写成一个字符串常量：
    /// 写死反斜杠在非 Windows 上只是普通字符，测试会测不到真实行为。
    fn make(dir: &std::path::Path, segments: &[&str]) {
        let mut path = dir.to_path_buf();
        for segment in segments {
            path.push(segment);
        }
        std::fs::create_dir_all(&path).expect("无法创建目录");
    }

    #[test]
    fn build_skips_dependencies_and_system_dirs() {
        let root = scratch("skip");
        make(&root, &["projects", "alpha"]);
        make(&root, &["projects", "alpha", "node_modules", "left-pad"]);
        make(&root, &["Windows", "System32"]);
        make(&root, &["projects", ".hidden"]);
        make(&root, &["projects", "alpha", "target"]);

        let outcome = build(
            &[root.to_string_lossy().to_string()],
            MAX_DEPTH,
            &AtomicBool::new(false),
            &|_| {},
        );
        let paths: Vec<String> = outcome
            .entries
            .iter()
            .map(|entry| entry.path.to_lowercase())
            .collect();

        assert!(paths.iter().any(|p| p.ends_with("alpha")));
        assert!(!paths.iter().any(|p| p.contains("node_modules")));
        assert!(!paths.iter().any(|p| p.contains("windows")));
        assert!(!paths.iter().any(|p| p.contains(".hidden")));
        assert!(!paths.iter().any(|p| p.ends_with("target")));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn build_respects_depth_limit() {
        let root = scratch("depth");
        make(&root, &["a", "b", "c", "d", "e"]);

        let outcome = build(
            &[root.to_string_lossy().to_string()],
            MAX_DEPTH,
            &AtomicBool::new(false),
            &|_| {},
        );
        let max_depth = outcome
            .entries
            .iter()
            .map(|entry| entry.depth)
            .max()
            .unwrap_or(0);
        assert!(max_depth <= MAX_DEPTH as u8, "不应超过深度上限");
        // 第 4 层（a/b/c/d）应存在，第 5 层（e）不应存在。
        assert!(outcome.entries.iter().any(|entry| entry.depth == 4));
        assert!(!outcome
            .entries
            .iter()
            .any(|entry| entry.path.ends_with("e")));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn stale_build_result_is_rejected() {
        // 索引被关闭后，在途构建交回的结果必须被丢弃：
        // 否则「关掉磁盘搜索」之后索引会自己复活，且残缺结果还会被写进缓存。
        let store = IndexStore::new();
        let handle = store
            .begin(vec!["C:\\scan-root".to_string()])
            .expect("应当开始构建");
        store.disable();

        assert!(
            !store.finish(BuildOutcome::default(), 1, handle.generation),
            "过期构建的结果不应被接受"
        );
        assert!(!store.status().ready, "索引应保持关闭状态");
    }

    #[test]
    fn abort_clears_build_state_only() {
        let store = IndexStore::new();
        let handle = store
            .begin(vec!["C:\\scan-root".to_string()])
            .expect("应当开始构建");
        store.abort(handle.generation);

        let status = store.status();
        assert!(!status.building, "取消后不应仍在构建");
        assert!(!status.ready, "取消的构建不应让索引就绪");
    }

    #[test]
    fn overlapping_roots_do_not_duplicate_entries() {
        let root = scratch("overlap");
        make(&root, &["projects", "alpha"]);

        let base = root.to_string_lossy().to_string();
        let nested = root.join("projects").to_string_lossy().to_string();
        let outcome = build(&[base, nested], MAX_DEPTH, &AtomicBool::new(false), &|_| {});
        let mut unique: Vec<String> = outcome
            .entries
            .iter()
            .map(|entry| entry.path.to_lowercase())
            .collect();
        let total = unique.len();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), total, "重叠根不应产生重复条目");
        std::fs::remove_dir_all(&root).ok();
    }

    fn entry(path: &str, depth: u8) -> Entry {
        Entry {
            path: path.into(),
            name_lower: display_name_of(path).to_lowercase(),
            depth,
            root: 0,
        }
    }

    #[test]
    fn search_prefers_prefix_over_inner_match() {
        let entries = vec![
            entry("C:\\\\a\\\\my-rework", 2),
            entry("C:\\\\a\\\\rework", 2),
            entry("D:\\\\b\\\\rework-tools", 1),
        ];
        let hits = search_entries(&entries, "rework", 10);
        assert_eq!(hits[0].name, "rework", "完全匹配应排第一");
        assert!(hits.iter().any(|hit| hit.name == "my-rework"));
    }

    #[test]
    fn search_is_case_insensitive_and_capped() {
        let entries: Vec<Entry> = (0..40)
            .map(|i| entry(&format!("C:\\\\p\\\\Proj{i}"), 2))
            .collect();
        let hits = search_entries(&entries, "proj", 5);
        assert_eq!(hits.len(), 5, "必须遵守上限");
        assert!(hits[0].path.to_lowercase().contains("proj"));
    }

    #[test]
    fn empty_query_returns_nothing() {
        let entries = vec![entry("C:\\\\p\\\\alpha", 2)];
        assert!(search_entries(&entries, "   ", 10).is_empty());
    }

    #[test]
    fn cancel_stops_the_walk() {
        let root = scratch("cancel");
        for i in 0..50 {
            make(&root, &[&format!("dir{i}"), "sub"]);
        }
        let cancel = AtomicBool::new(true);
        let outcome = build(
            &[root.to_string_lossy().to_string()],
            MAX_DEPTH,
            &cancel,
            &|_| {},
        );
        assert!(outcome.entries.is_empty(), "取消后不应继续收集");
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn index_store_reports_state_transitions() {
        let store = IndexStore::new();
        assert!(!store.status().ready);

        let handle = store.begin(vec!["C:\\\\".into()]).expect("首次应能开始");
        assert!(store.status().building);
        assert!(
            store.begin(vec!["C:\\\\".into()]).is_none(),
            "重复开始应被拒绝"
        );

        store.set_scanned(128, handle.generation);
        assert_eq!(store.status().scanned, 128);

        assert!(store.finish(
            BuildOutcome {
                entries: vec![entry("C:\\\\p\\\\alpha", 2)],
                truncated: false,
                warnings: vec![],
            },
            42,
            handle.generation,
        ));
        let status = store.status();
        assert!(status.ready);
        assert!(!status.building);
        assert_eq!(status.entries, 1);
        assert_eq!(status.built_at, 42);
        assert!(!handle.cancel.load(std::sync::atomic::Ordering::Relaxed));

        assert_eq!(store.search("alpha", 5).hits.len(), 1);
    }
}

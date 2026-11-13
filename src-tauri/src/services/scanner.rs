//! 磁盘文件夹扫描。
//!
//! 面向「按名称找文件夹」的场景：限制深度、跳过依赖与构建产物目录，
//! 避免在 `node_modules` 这类巨型目录上浪费时间。

use walkdir::{DirEntry, WalkDir};

/// 扫描时直接跳过的目录名。
const SKIP_DIR_NAMES: &[&str] = &[
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
];

/// 扫描配置。新增扫描策略（深度、根目录过滤等）在此扩展。
pub struct ScanOptions<'a> {
    pub roots: &'a [String],
    pub max_depth: usize,
    pub max_results: usize,
}

impl<'a> Default for ScanOptions<'a> {
    fn default() -> Self {
        Self {
            roots: &[],
            max_depth: 4,
            max_results: 60,
        }
    }
}

fn is_skipped(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }
    let name = entry.file_name().to_string_lossy();
    // 目录名统一按小写比较：Windows 上 `Node_Modules` 与 `node_modules`
    // 指向同一个目录，大小写敏感比较会让跳过规则形同虚设。
    let lower = name.to_lowercase();
    SKIP_DIR_NAMES.contains(&lower.as_str()) || name.starts_with('.')
}

/// 在所有根目录下搜索名称包含 `query` 的文件夹（大小写不敏感）。
pub fn scan(roots: &[String], query: &str, max_results: usize) -> Vec<String> {
    let options = ScanOptions {
        roots,
        max_results,
        ..Default::default()
    };
    scan_with(&options, query)
}

/// 按显式配置执行扫描。
pub fn scan_with(options: &ScanOptions<'_>, query: &str) -> Vec<String> {
    // 查询词先 trim：只输入空格时不应触发整盘遍历。
    // （磁盘索引侧 `index::search_entries` 同样先 trim，两处保持一致。）
    let needle = query.trim().to_lowercase();
    let mut results = Vec::new();
    if needle.is_empty() {
        return results;
    }

    'roots: for root in options.roots {
        let walker = WalkDir::new(root)
            .max_depth(options.max_depth)
            .into_iter()
            .filter_entry(|entry| !is_skipped(entry));

        for entry in walker {
            if results.len() >= options.max_results {
                break 'roots;
            }
            let Ok(entry) = entry else { continue };
            if !entry.file_type().is_dir() {
                continue;
            }
            if entry
                .file_name()
                .to_string_lossy()
                .to_lowercase()
                .contains(&needle)
            {
                let path = entry.path().to_string_lossy().to_string();
                if !results.contains(&path) {
                    results.push(path);
                }
            }
        }
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 建一个只属于当前测试的临时目录，放在 `target/` 下保证可写。
    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("scanner-tests")
            .join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("无法创建测试目录");
        dir
    }

    #[test]
    fn blank_query_returns_nothing() {
        // 空白查询必须直接返回，不能顺手把整盘走一遍。
        let root = scratch("blank");
        std::fs::create_dir_all(root.join("alpha")).expect("无法创建目录");
        let results = scan(&[root.to_string_lossy().to_string()], "   ", 10);
        assert!(results.is_empty());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn skips_dependency_directories_case_insensitively() {
        // Windows 上目录名大小写不敏感，`Node_Modules` 必须同样被跳过。
        let root = scratch("case");
        std::fs::create_dir_all(root.join("Alpha").join("Node_Modules").join("left-pad"))
            .expect("无法创建目录");
        std::fs::create_dir_all(root.join("Alpha").join("keep")).expect("无法创建目录");
        let base = root.to_string_lossy().to_string();

        assert!(
            scan(std::slice::from_ref(&base), "left-pad", 10).is_empty(),
            "依赖目录不应被扫描到"
        );
        assert_eq!(scan(&[base], "keep", 10).len(), 1, "普通目录应能被扫描到");
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn skips_dependency_directories() {
        let entry_root = WalkDir::new(".").into_iter().next().unwrap().unwrap();
        assert!(!is_skipped(&entry_root), "根目录本身必须参与扫描");
    }
}

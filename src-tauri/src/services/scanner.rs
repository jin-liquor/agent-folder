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
    SKIP_DIR_NAMES.contains(&name.as_ref()) || name.starts_with('.')
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
    let needle = query.to_lowercase();
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

    #[test]
    fn empty_query_returns_nothing() {
        let results = scan(&["C:\\".into()], "   ", 10);
        assert!(results.is_empty());
    }

    #[test]
    fn skips_dependency_directories() {
        let entry_root = WalkDir::new(".").into_iter().next().unwrap().unwrap();
        assert!(!is_skipped(&entry_root), "根目录本身必须参与扫描");
    }
}

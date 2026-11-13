//! 目录浏览命令，供内置目录树使用。
//!
//! 只做「列出某个目录下的子目录」，不递归、不读文件内容，
//! 由前端按需逐层展开，避免一次性遍历整棵磁盘树。

use serde::Serialize;

/// 目录树中的一个节点。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    /// 完整路径。
    pub path: String,
    /// 展示名（目录名）。
    pub name: String,
    /// 是否还有子目录，用于决定是否显示展开箭头。
    ///
    /// 由后端探测一层得到：避免前端展开时才发现是空目录而出现「点了没反应」。
    pub has_children: bool,
}

/// 单个目录最多返回的子目录数，防止超宽目录卡住界面。
const MAX_ENTRIES: usize = 500;

/// 列出磁盘驱动器（目录树的根）。
#[tauri::command]
pub fn list_drives() -> Vec<DirEntry> {
    // Windows 上枚举 A: 到 Z:，用 metadata 判断是否为可用磁盘。
    (b'A'..=b'Z')
        .filter_map(|letter| {
            let root = format!("{}:\\", letter as char);
            let path = std::path::Path::new(&root);
            path.exists().then(|| DirEntry {
                name: format!("{}:", letter as char),
                path: root,
                has_children: true,
            })
        })
        .collect()
}

/// 列出指定目录下的子目录（不递归）。
///
/// 隐藏目录与系统目录一并返回——用户可能确实想打开它们；
/// 排序规则：先按名称字典序，便于查找。
#[tauri::command]
pub fn list_subdirs(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("目录不存在：{path}"));
    }

    let entries = std::fs::read_dir(dir).map_err(|e| format!("读取目录失败：{e}"))?;

    let mut dirs: Vec<(String, std::path::PathBuf)> = entries
        .flatten()
        .filter(|entry| entry.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|entry| {
            (
                entry.file_name().to_string_lossy().to_string(),
                entry.path(),
            )
        })
        .collect();

    dirs.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    Ok(dirs
        .into_iter()
        .take(MAX_ENTRIES)
        .map(|(name, path)| DirEntry {
            has_children: has_subdir(&path),
            name,
            path: path.to_string_lossy().to_string(),
        })
        .collect())
}

/// 判断目录下是否还有子目录（只探测到第一个命中即返回）。
fn has_subdir(dir: &std::path::Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries
        .flatten()
        .any(|entry| entry.file_type().map(|t| t.is_dir()).unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drives_are_listed() {
        let drives = list_drives();
        assert!(!drives.is_empty(), "至少应有一个可用磁盘");
        assert!(drives.iter().all(|d| d.path.ends_with(":\\")));
    }

    #[test]
    fn missing_directory_reports_error() {
        let result = list_subdirs("Z:\\definitely-not-here-xyz".into());
        assert!(result.is_err());
    }

    #[test]
    fn crate_dir_lists_subdirectories() {
        // src-tauri 下有 src/ 子目录，应能被列出且标记为可展开。
        let dirs = list_subdirs(env!("CARGO_MANIFEST_DIR").into()).unwrap();
        let src = dirs.iter().find(|d| d.name == "src");
        assert!(src.is_some(), "应列出 src 目录");
        assert!(src.unwrap().has_children, "src 下还有子目录");
    }

    #[test]
    fn entries_are_sorted_case_insensitively() {
        let dirs = list_subdirs(env!("CARGO_MANIFEST_DIR").into()).unwrap();
        let names: Vec<String> = dirs.iter().map(|d| d.name.to_lowercase()).collect();
        let mut sorted = names.clone();
        sorted.sort();
        assert_eq!(names, sorted, "子目录应按名称排序");
    }
}

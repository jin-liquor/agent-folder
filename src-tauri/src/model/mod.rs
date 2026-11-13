//! 数据模型层。
//!
//! 只描述「数据长什么样」，不包含读写磁盘或启动进程等副作用逻辑。
//! 新增可持久化字段时，请优先修改本目录下的结构体，并同步
//! `src/lib/types.ts` 中对应的 TypeScript 类型。

mod folder;
mod settings;

pub use folder::FolderRecord;
pub use settings::{AppSettings, CliPaths};

#[cfg(test)]
pub use settings::builtin_presets;

/// 当前 Unix 时间戳（毫秒），作为全应用统一的时间来源。
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 把路径统一成 Windows 风格：正斜杠转反斜杠，去掉首尾空白与多余的尾部斜杠。
///
/// 该函数同时承担「判定两个路径是否相同」的归一化职责，因此所有写入
/// 记录前都必须先经过它。空白输入返回空串，调用方据此判定为无效路径。
pub fn normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut p = trimmed.replace('/', "\\");
    while p.len() > 3 && p.ends_with('\\') {
        p.pop();
    }
    p
}

/// 从绝对路径推导出展示名；取不到文件名时退回完整路径。
///
/// 路径经 [`normalize_path`] 之后一律是 Windows 风格（反斜杠分隔），
/// 因此这里按反斜杠切分，**不依赖宿主系统的路径语义**：
/// `std::path::Path::file_name` 在 Linux/macOS 上不认反斜杠，
/// `C:\Projects\App` 会被当成一个整体，名字退化成整条路径。
pub fn display_name_of(path: &str) -> String {
    path.rsplit('\\')
        .find(|part| !part.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| path.to_string())
}

#[cfg(test)]
mod tests {
    use super::normalize_path;

    #[test]
    fn blank_paths_normalize_to_empty() {
        assert_eq!(normalize_path(""), "");
        assert_eq!(normalize_path("   "), "");
        assert_eq!(normalize_path("\t\n"), "");
    }

    #[test]
    fn slashes_and_trailing_separators_are_unified() {
        assert_eq!(normalize_path("C:/Projects/App/"), "C:\\Projects\\App");
        // 盘符根目录必须保留尾部反斜杠，否则会变成 "C:"。
        assert_eq!(normalize_path("C:\\"), "C:\\");
        assert_eq!(normalize_path("C:/"), "C:\\");
    }

    #[test]
    fn surrounding_whitespace_is_trimmed() {
        assert_eq!(normalize_path("  C:\\Projects\\App  "), "C:\\Projects\\App");
    }
}

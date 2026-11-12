//! 磁盘索引缓存：`index.json` 的读写与指纹校验。
//!
//! 索引是**可丢弃的加速数据**：读取失败一律返回 `None`，由调用方重建，
//! 绝不因为缓存损坏而影响主流程，也不会像 `data.json` 那样触发只读保护。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::data_dir;

/// 缓存格式版本；索引结构变化时必须递增，旧缓存会被自动丢弃。
pub const FORMAT_VERSION: u32 = 1;

/// 落盘的索引快照。
#[derive(Debug, Serialize, Deserialize)]
pub struct CachedIndex {
    #[serde(default)]
    pub format_version: u32,
    /// 扫描根 + 深度 + 跳过规则共同决定的指纹。
    pub fingerprint: String,
    pub built_at: i64,
    pub max_depth: usize,
    pub entries: Vec<CachedEntry>,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// 单条缓存记录。名称小写化在加载时重算，避免落盘两份字符串。
#[derive(Debug, Serialize, Deserialize)]
pub struct CachedEntry {
    pub path: String,
    pub depth: u8,
    pub root: u8,
}

/// 索引文件位置：`%APPDATA%/agent-folder/index.json`。
pub fn path() -> PathBuf {
    data_dir().join("index.json")
}

/// 计算索引指纹。
///
/// 使用自带 FNV-1a 而不是 `DefaultHasher`：后者不保证跨 Rust 版本稳定，
/// 会导致升级后缓存莫名其妙地全部失效。
pub fn fingerprint(roots: &[String], max_depth: usize) -> String {
    let mut normalized: Vec<String> = roots.iter().map(|root| normalize_root(root)).collect();
    normalized.retain(|root| !root.is_empty());
    normalized.sort();

    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let mut feed = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    };
    feed(&FORMAT_VERSION.to_le_bytes());
    feed(&(max_depth as u64).to_le_bytes());
    for root in &normalized {
        feed(root.as_bytes());
        feed(&[0u8]);
    }
    format!("{hash:016x}")
}

/// 统一根目录写法：斜杠转反斜杠、合并重复分隔符、去掉尾部斜杠、转小写。
///
/// 只用于指纹比较，不写回设置，因此可以放心地把 `C:\` 与 `c:/` 视作同一个根。
fn normalize_root(root: &str) -> String {
    root.trim()
        .replace('/', "\\")
        .split('\\')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\\")
        .to_lowercase()
}

/// 读取缓存；任何异常都视为「没有缓存」。
pub fn load(path: &Path) -> Option<CachedIndex> {
    let raw = std::fs::read_to_string(path).ok()?;
    let cached: CachedIndex = serde_json::from_str(&raw).ok()?;
    if cached.format_version != FORMAT_VERSION {
        return None;
    }
    Some(cached)
}

/// 原子写入缓存。
pub fn save(path: &Path, cached: &CachedIndex) -> Result<(), String> {
    let json = serde_json::to_string(cached).map_err(|error| format!("序列化索引失败：{error}"))?;
    super::write_atomic(path, json.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("index-cache-tests")
            .join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("无法创建测试目录");
        dir
    }

    fn sample() -> CachedIndex {
        CachedIndex {
            format_version: FORMAT_VERSION,
            fingerprint: "abc".into(),
            built_at: 1,
            max_depth: 4,
            entries: vec![CachedEntry {
                path: "C:\\\\Projects\\\\demo".into(),
                depth: 2,
                root: 0,
            }],
            truncated: false,
            warnings: vec![],
        }
    }

    #[test]
    fn round_trip_preserves_entries() {
        let dir = scratch("roundtrip");
        let path = dir.join("index.json");
        save(&path, &sample()).unwrap();

        let loaded = load(&path).expect("应能读回缓存");
        assert_eq!(loaded.entries.len(), 1);
        assert_eq!(loaded.entries[0].path, "C:\\\\Projects\\\\demo");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_cache_is_ignored() {
        let dir = scratch("corrupt");
        let path = dir.join("index.json");
        std::fs::write(&path, "{ not json").unwrap();

        assert!(load(&path).is_none(), "损坏缓存必须当作不存在");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn old_format_version_is_rejected() {
        let dir = scratch("version");
        let path = dir.join("index.json");
        let mut cached = sample();
        cached.format_version = FORMAT_VERSION - 1;
        std::fs::write(&path, serde_json::to_string(&cached).unwrap()).unwrap();

        assert!(load(&path).is_none(), "旧格式缓存必须失效重建");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fingerprint_is_order_and_separator_insensitive() {
        let a = fingerprint(&["C:\\\\Projects".into(), "E:\\\\work".into()], 4);
        let b = fingerprint(&["e:/work/".into(), "c:/projects".into()], 4);
        assert_eq!(a, b, "根顺序与斜杠差异不应改变指纹");

        let deeper = fingerprint(&["C:\\\\Projects".into(), "E:\\\\work".into()], 5);
        assert_ne!(a, deeper, "深度变化必须换指纹");
    }
}

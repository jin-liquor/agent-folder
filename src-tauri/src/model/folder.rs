//! 文件夹记录模型。

use serde::{Deserialize, Serialize};

use super::now_ms;

/// 一条被记录的文件夹。
///
/// 用户主动「添加」与通过「打开」产生的历史记录共用同一结构，
/// 区别在于 `open_count` / `last_opened_at` 是否被写过。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FolderRecord {
    pub id: String,
    pub path: String,
    pub name: String,
    pub tags: Vec<String>,
    pub color: Option<String>,
    pub favorite: bool,
    pub open_count: u32,
    pub last_opened_at: i64,
    pub created_at: i64,
    /// 识别出的项目类型（如 `rust`、`node`），普通文件夹为 `None`。
    ///
    /// 落盘保存，避免每次渲染都去读磁盘；仅在记录新增时计算一次。
    pub kind: Option<String>,
}

impl Default for FolderRecord {
    fn default() -> Self {
        Self {
            id: String::new(),
            path: String::new(),
            name: String::new(),
            tags: Vec::new(),
            color: None,
            favorite: false,
            open_count: 0,
            last_opened_at: 0,
            created_at: now_ms(),
            kind: None,
        }
    }
}

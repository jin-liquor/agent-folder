//! 内存中的数据集与其操作。

use serde::{Deserialize, Serialize};

use crate::model::{display_name_of, normalize_path, now_ms, AppSettings, FolderRecord};
use crate::services::project;

/// 记录数量上限。
///
/// 历史记录会随使用持续增长，裁剪可避免 `data.json` 无限膨胀导致读写变慢。
/// 收藏的记录永不裁剪。
pub const MAX_RECORDS: usize = 500;

/// `data.json` 的根结构。
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppData {
    pub folders: Vec<FolderRecord>,
    pub settings: AppSettings,
}

impl AppData {
    /// 按最近打开时间倒序返回记录，供命令层直接使用。
    pub fn sorted_by_recent(&self) -> Vec<FolderRecord> {
        let mut folders = self.folders.clone();
        folders.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
        folders
    }

    /// 添加一条「已保存但未打开」的记录。
    ///
    /// 路径已存在时直接返回原记录，不会重置历史统计。
    pub fn add_folder(&mut self, path: &str) -> FolderRecord {
        let norm = normalize_path(path);
        if let Some(existing) = self.find_by_path(&norm) {
            return existing.clone();
        }
        let record = FolderRecord {
            id: uuid::Uuid::new_v4().to_string(),
            name: display_name_of(&norm),
            kind: project::detect(&norm).map(|k| k.id.to_string()),
            path: norm,
            created_at: now_ms(),
            ..Default::default()
        };
        self.folders.push(record.clone());
        self.trim_history();
        record
    }

    /// 记录一次成功打开：累加次数并刷新时间，必要时新建记录。
    pub fn upsert(&mut self, path: &str) -> FolderRecord {
        let norm = normalize_path(path);
        if let Some(existing) = self.find_by_path_mut(&norm) {
            existing.open_count += 1;
            existing.last_opened_at = now_ms();
            // 项目标记文件可能在使用过程中才出现（如刚 `cargo init`），
            // 因此每次打开都重新识别一次，确保徽标与磁盘现状一致。
            existing.kind = project::detect(&norm).map(|k| k.id.to_string());
            return existing.clone();
        }
        let record = FolderRecord {
            id: uuid::Uuid::new_v4().to_string(),
            name: display_name_of(&norm),
            kind: project::detect(&norm).map(|k| k.id.to_string()),
            path: norm,
            created_at: now_ms(),
            last_opened_at: now_ms(),
            open_count: 1,
            ..Default::default()
        };
        self.folders.push(record.clone());
        self.trim_history();
        record
    }

    /// 移除一条记录，返回是否确实删除。
    pub fn remove_folder(&mut self, id: &str) -> bool {
        let before = self.folders.len();
        self.folders.retain(|f| f.id != id);
        self.folders.len() != before
    }

    /// 按 id 取可变引用，供「收藏 / 重命名 / 改色」复用。
    pub fn find_mut(&mut self, id: &str) -> Option<&mut FolderRecord> {
        self.folders.iter_mut().find(|f| f.id == id)
    }

    /// 最近打开的若干条（托盘菜单使用）。
    pub fn recent(&self, limit: usize) -> Vec<FolderRecord> {
        self.sorted_by_recent().into_iter().take(limit).collect()
    }

    /// 合并导入的记录，按路径去重。
    ///
    /// 已存在的记录**保留本地版本**（用户可能在两台机器上改过名称/颜色），
    /// 只统计为跳过；不存在的追加进来。返回新增与跳过的数量。
    pub fn merge_imported(
        &mut self,
        incoming: Vec<FolderRecord>,
    ) -> crate::commands::ImportSummary {
        let mut added_ids = Vec::new();
        let mut skipped = 0;

        for mut record in incoming {
            let norm = normalize_path(&record.path);
            if norm.is_empty() {
                skipped += 1;
                continue;
            }
            if self.find_by_path(&norm).is_some() {
                skipped += 1;
                continue;
            }

            record.path = norm;
            // 导入的记录可能来自旧版本，补全必要字段。
            if record.id.trim().is_empty() {
                record.id = uuid::Uuid::new_v4().to_string();
            }
            if record.name.trim().is_empty() {
                record.name = display_name_of(&record.path);
            }
            if record.kind.is_none() {
                record.kind = project::detect(&record.path).map(|k| k.id.to_string());
            }
            added_ids.push(record.id.clone());
            self.folders.push(record);
        }

        self.trim_history();
        let added = added_ids
            .iter()
            .filter(|id| self.folders.iter().any(|record| record.id == id.as_str()))
            .count();
        crate::commands::ImportSummary {
            added,
            skipped,
            trimmed: added_ids.len() - added,
        }
    }

    /// 裁剪非收藏记录，使总数不超过 [`MAX_RECORDS`]。
    /// 先按最近打开时间保留，再丢弃最久未用的非收藏项；
    /// 收藏项优先级最高，永远不会被裁掉。
    fn trim_history(&mut self) {
        if self.folders.len() <= MAX_RECORDS {
            return;
        }

        // 非收藏记录按最近使用排序，超出配额的部分丢弃。
        let mut ranked: Vec<(usize, i64)> = self
            .folders
            .iter()
            .enumerate()
            .filter(|(_, f)| !f.favorite)
            .map(|(index, f)| (index, f.last_opened_at))
            .collect();
        ranked.sort_by(|a, b| b.1.cmp(&a.1));

        let favorites = self.folders.len() - ranked.len();
        let keep = MAX_RECORDS.saturating_sub(favorites);
        let mut drop_indexes: Vec<usize> = ranked.into_iter().skip(keep).map(|(i, _)| i).collect();
        drop_indexes.sort_unstable();

        for index in drop_indexes.into_iter().rev() {
            self.folders.remove(index);
        }
    }

    fn find_by_path(&self, norm: &str) -> Option<&FolderRecord> {
        self.folders
            .iter()
            .find(|f| f.path.eq_ignore_ascii_case(norm))
    }

    fn find_by_path_mut(&mut self, norm: &str) -> Option<&mut FolderRecord> {
        self.folders
            .iter_mut()
            .find(|f| f.path.eq_ignore_ascii_case(norm))
    }
}

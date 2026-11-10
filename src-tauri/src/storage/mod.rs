//! 存储层：负责 `data.json` 的读写与内存态管理。
//!
//! 这里不处理业务语义（例如「打开后是否隐藏窗口」），只保证：
//! 1. 数据落在 `%APPDATA%/agent-folder/data.json`；
//! 2. 记录集合的增删改是幂等、按路径去重的；
//! 3. 保存失败时能回滚内存状态（由调用方决定是否回滚）。

mod data;
mod store;

// `AppData` 供测试与内部使用，非公开 API。
#[allow(unused_imports)]
pub use data::AppData;
pub use store::{StorageStatus, Store};

#[cfg(test)]
mod tests {
    use super::AppData;
    use crate::storage::data::MAX_RECORDS;

    #[test]
    fn adding_folder_does_not_mark_it_as_opened() {
        let mut data = AppData::default();
        let added = data.add_folder("C:/Projects/Example");
        assert_eq!(added.open_count, 0);
        assert_eq!(added.last_opened_at, 0);
        assert_eq!(data.folders.len(), 1);

        // 大小写与尾部斜杠差异不应产生重复记录。
        let duplicate = data.add_folder("c:\\Projects\\Example\\");
        assert_eq!(duplicate.id, added.id);
        assert_eq!(data.folders.len(), 1);
    }

    #[test]
    fn opening_folder_updates_history_once() {
        let mut data = AppData::default();
        let first = data.upsert("C:/Projects/Example");
        assert_eq!(first.open_count, 1);
        assert!(first.last_opened_at > 0);

        let second = data.upsert("c:\\Projects\\Example\\");
        assert_eq!(second.id, first.id);
        assert_eq!(second.open_count, 2);
    }

    #[test]
    fn old_records_get_default_fields() {
        use crate::model::FolderRecord;
        let record = FolderRecord {
            path: "C:\\Projects\\Example".into(),
            ..Default::default()
        };
        assert!(!record.favorite);
        assert!(record.tags.is_empty());
        assert!(record.kind.is_none());
    }

    #[test]
    fn history_is_trimmed_to_limit_but_favorites_survive() {
        let mut data = AppData::default();

        // 先放一条很久以前的收藏记录，它必须不被裁剪。
        let pinned = data.add_folder("C:\\keep\\Favorite");
        data.find_mut(&pinned.id).unwrap().favorite = true;
        data.find_mut(&pinned.id).unwrap().last_opened_at = 0;

        // 填满并超出上限。
        for i in 0..MAX_RECORDS + 40 {
            data.upsert(&format!("C:\\history\\item{i}"));
        }

        assert_eq!(data.folders.len(), MAX_RECORDS);
        assert!(
            data.folders.iter().any(|f| f.id == pinned.id),
            "收藏记录不应被裁剪"
        );
    }

    #[test]
    fn trim_keeps_the_most_recent_entries() {
        let mut data = AppData::default();
        for i in 0..MAX_RECORDS + 10 {
            let record = data.upsert(&format!("C:\\history\\item{i}"));
            // 让后写入的记录时间严格更大，便于断言。
            data.find_mut(&record.id).unwrap().last_opened_at = 1_000 + i as i64;
        }

        assert_eq!(data.folders.len(), MAX_RECORDS);
        // 最早写入的条目应已被裁掉。
        assert!(!data.folders.iter().any(|f| f.path.ends_with("item0")));
        // 最新一条必须还在。
        assert!(data
            .folders
            .iter()
            .any(|f| f.path.ends_with(&format!("item{}", MAX_RECORDS + 9))));
    }

    #[test]
    fn import_skips_existing_paths_and_keeps_local_edits() {
        use crate::model::FolderRecord;

        let mut data = AppData::default();
        let local = data.add_folder("C:\\Projects\\Keep");
        // 本地改过名称，导入时不应被外部文件覆盖。
        data.find_mut(&local.id).unwrap().name = "本地名称".into();

        let incoming = vec![
            FolderRecord {
                id: "external-1".into(),
                path: "c:\\projects\\keep\\".into(),
                name: "外部名称".into(),
                ..Default::default()
            },
            FolderRecord {
                id: "external-2".into(),
                path: "C:\\Projects\\New".into(),
                name: "新项目".into(),
                ..Default::default()
            },
        ];

        let summary = data.merge_imported(incoming);
        assert_eq!(summary.added, 1);
        assert_eq!(summary.skipped, 1);
        assert_eq!(data.folders.len(), 2);

        let kept = data
            .folders
            .iter()
            .find(|f| f.path.eq_ignore_ascii_case("C:\\Projects\\Keep"))
            .unwrap();
        assert_eq!(kept.name, "本地名称", "已有记录必须保留本地版本");
    }

    #[test]
    fn import_reports_capacity_trimmed_records() {
        use crate::model::FolderRecord;

        let mut data = AppData::default();
        for i in 0..MAX_RECORDS {
            data.upsert(&format!("C:\\\\existing\\\\item{i}"));
        }
        let incoming: Vec<FolderRecord> = (0..20)
            .map(|i| FolderRecord {
                path: format!("C:\\\\imported\\\\item{i}"),
                ..Default::default()
            })
            .collect();

        let summary = data.merge_imported(incoming);
        assert_eq!(summary.added + summary.trimmed, 20);
        assert_eq!(data.folders.len(), MAX_RECORDS);
        assert!(summary.trimmed > 0);
    }
    #[test]
    fn import_fills_missing_fields() {
        use crate::model::FolderRecord;

        let mut data = AppData::default();
        let summary = data.merge_imported(vec![FolderRecord {
            // id 与 name 都缺失，导入时应自动补全。
            path: "C:\\Projects\\Bare".into(),
            ..Default::default()
        }]);

        assert_eq!(summary.added, 1);
        let record = &data.folders[0];
        assert!(!record.id.is_empty(), "缺少 id 应自动生成");
        assert_eq!(record.name, "Bare", "缺少名称应取目录名");
    }

    #[test]
    fn import_ignores_blank_paths() {
        use crate::model::FolderRecord;

        let mut data = AppData::default();
        let summary = data.merge_imported(vec![FolderRecord {
            path: "   ".into(),
            ..Default::default()
        }]);

        assert_eq!(summary.added, 0);
        assert_eq!(summary.skipped, 1);
        assert!(data.folders.is_empty());
    }
}

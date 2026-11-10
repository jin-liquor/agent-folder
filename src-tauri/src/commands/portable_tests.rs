//! 导入导出的端到端测试。
//!
//! 通过真实的临时文件走一遍「导出 → 读回 → 导入」流程，
//! 覆盖 JSON 格式、去重规则与错误分支。

use std::path::PathBuf;

use crate::commands::portable::{ExportBundle, APP_TAG, EXPORT_VERSION};
use crate::model::FolderRecord;
use crate::storage::AppData;

/// 建一个只属于当前测试的目录，放在 `target/` 下保证可写。
fn scratch(tag: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("test-scratch")
        .join(format!("port-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("无法创建测试目录");
    dir
}

#[test]
fn export_then_import_round_trips() {
    let dir = scratch("roundtrip");
    let file = dir.join("export.json");

    // 准备一份数据并写成导出格式。
    let mut source = AppData::default();
    source.add_folder("C:\\Projects\\Alpha");
    source.upsert("C:\\Projects\\Beta");

    let bundle = ExportBundle {
        app: APP_TAG.to_string(),
        version: EXPORT_VERSION,
        folders: source.sorted_by_recent(),
    };
    std::fs::write(&file, serde_json::to_string_pretty(&bundle).unwrap()).unwrap();

    // 读回并导入到空数据集。
    let raw = std::fs::read_to_string(&file).unwrap();
    let parsed: ExportBundle = serde_json::from_str(&raw).unwrap();
    assert_eq!(parsed.app, APP_TAG);
    assert_eq!(parsed.folders.len(), 2);

    let mut target = AppData::default();
    let summary = target.merge_imported(parsed.folders);
    assert_eq!(summary.added, 2);
    assert_eq!(summary.skipped, 0);
    assert_eq!(target.folders.len(), 2);

    // 再导入一次，应当全部跳过（按路径去重）。
    let again = serde_json::from_str::<ExportBundle>(&raw).unwrap();
    let second = target.merge_imported(again.folders);
    assert_eq!(second.added, 0);
    assert_eq!(second.skipped, 2);
    assert_eq!(target.folders.len(), 2);

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn export_bundle_rejects_foreign_file() {
    // 来源标识不符时应能被识别出来（命令层据此拒绝导入）。
    let foreign: ExportBundle =
        serde_json::from_str(r#"{"app":"some-other-app","version":1,"folders":[]}"#).unwrap();
    assert_ne!(foreign.app, APP_TAG);
}

#[test]
fn unknown_fields_do_not_break_parsing() {
    // 未来版本可能增加字段，旧版本应能容忍而不是直接失败。
    let bundle: ExportBundle = serde_json::from_str(
        r#"{"app":"agent-folder","version":1,"folders":[],"futureField":{"x":1}}"#,
    )
    .unwrap();
    assert_eq!(bundle.app, APP_TAG);
    assert!(bundle.folders.is_empty());
}

#[test]
fn records_missing_optional_fields_are_accepted() {
    // 导出文件里字段不全（例如手工编辑过）也应能导入。
    let bundle: ExportBundle = serde_json::from_str(
        r#"{"app":"agent-folder","version":1,"folders":[{"path":"C:\\Only\\Path"}]}"#,
    )
    .unwrap();
    assert_eq!(bundle.folders.len(), 1);

    let mut data = AppData::default();
    let summary = data.merge_imported(bundle.folders);
    assert_eq!(summary.added, 1);
    let record: &FolderRecord = &data.folders[0];
    assert_eq!(record.name, "Path", "缺少名称应回退到目录名");
    assert!(!record.id.is_empty(), "缺少 id 应自动生成");
}

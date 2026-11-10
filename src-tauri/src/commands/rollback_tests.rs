//! 写入失败回滚的测试。
//!
//! 关键场景：内存已改、存盘失败时必须回滚，否则界面显示「已修改」
//! 而磁盘上没有，重启后改动凭空消失。

use std::path::PathBuf;

use crate::model::FolderRecord;
use crate::storage::{AppData, Store};

/// 构造一个指向不可写位置的 Store，用于触发保存失败。
///
/// 把 path 指向一个已存在的**目录**，`fs::write` 必然失败。
/// 构造一个保存必然失败的 Store。
///
/// `tag` 必须让每个测试唯一：`cargo test` 默认并行执行同一进程内的测试，
/// 若多个测试共用目录名，`remove_dir_all` 会删掉彼此刚创建的阻塞目录，
/// 导致保存意外成功、断言偶发失败。
fn store_with_unwritable_target(tag: &str) -> (Store, PathBuf) {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("test-scratch")
        .join(format!("rollback-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("无法创建测试目录");

    // 让 data.json 本身是个目录 —— 写入必定失败。
    let blocked = dir.join("data.json");
    std::fs::create_dir_all(&blocked).expect("无法创建阻塞目录");

    let store = Store::for_test(blocked, AppData::default());
    (store, dir)
}

#[test]
fn failed_save_rolls_back_memory_state() {
    let (store, dir) = store_with_unwritable_target("memory");

    // 先放入一条记录作为基线。
    store.data().add_folder("C:\\Baseline");
    assert_eq!(store.data().folders.len(), 1);

    // 走真实命令路径：内存改动 + 保存失败。
    let result = super::mutate_and_save(&store, |data| Ok(data.add_folder("C:\\Should\\Rollback")));
    assert!(result.is_err(), "保存应当失败");

    // 内存必须回到修改前的状态。
    assert_eq!(
        store.data().folders.len(),
        1,
        "保存失败后内存应回滚，不应残留半更新状态"
    );
    assert!(!store
        .data()
        .folders
        .iter()
        .any(|f| f.path.contains("Rollback")));

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn failed_save_keeps_original_record_unchanged() {
    let (store, dir) = store_with_unwritable_target("unchanged");

    let record = store.data().add_folder("C:\\Target");
    let id = record.id.clone();
    store.data().find_mut(&id).unwrap().name = "原名".into();

    // 尝试重命名，但保存会失败。
    let result = super::mutate_and_save(&store, |data| {
        let folder = data.find_mut(&id).ok_or("记录不存在")?;
        folder.name = "新名".into();
        Ok(folder.clone())
    });
    assert!(result.is_err());

    // 名称必须回滚到原值。
    let current: FolderRecord = store
        .data()
        .folders
        .iter()
        .find(|f| f.id == id)
        .cloned()
        .expect("记录应仍存在");
    assert_eq!(current.name, "原名", "保存失败后名称应回滚");

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn successful_save_persists_and_keeps_memory() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("test-scratch")
        .join(format!("persist-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let store = Store::for_test(dir.join("data.json"), AppData::default());
    super::mutate_and_save(&store, |data| Ok(data.add_folder("C:\\Persisted"))).unwrap();

    assert_eq!(store.data().folders.len(), 1);
    let written = std::fs::read_to_string(dir.join("data.json")).unwrap();
    assert!(written.contains("Persisted"), "数据应已落盘");

    std::fs::remove_dir_all(&dir).ok();
}

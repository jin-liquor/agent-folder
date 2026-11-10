//! 性能基准测试（手动运行，不参与默认 `cargo test`）。
//!
//! 目的：在记录数接近上限（500）时，量化以下操作的耗时，
//! 判断是否存在需要优化的真实瓶颈：
//!
//! - `mutate_and_save` 的快照克隆开销
//! - 整表序列化与落盘
//! - 排序与去重
//!
//! 运行方式：
//! ```text
//! cargo test --release -- --ignored --nocapture perf
//! ```

use std::time::Instant;

use crate::commands::mutate_and_save;
use crate::storage::{AppData, Store};

/// 构造接近上限的数据集。
fn seed(count: usize) -> AppData {
    let mut data = AppData::default();
    for i in 0..count {
        let record = data.upsert(&format!("C:\\Projects\\bench-item-{i}"));
        // 打散时间戳，模拟真实使用分布。
        if let Some(f) = data.find_mut(&record.id) {
            f.last_opened_at = 1_700_000_000_000 + (i as i64 * 37) % 100_000;
            f.tags = vec!["bench".into(), format!("tag{i}")];
        }
    }
    data
}

fn scratch(name: &str) -> std::path::PathBuf {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("perf-scratch")
        .join(name);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("无法创建基准目录");
    dir
}

#[test]
#[ignore = "性能基准，需手动运行"]
fn perf_snapshot_and_save_at_limit() {
    const N: usize = 500;
    let dir = scratch("snapshot");

    let data = seed(N);
    assert_eq!(data.folders.len(), N);

    // 1) 纯快照克隆：mutate_and_save 每次都要付这个成本。
    let start = Instant::now();
    for _ in 0..100 {
        let _clone = data.clone();
    }
    let clone_ms = start.elapsed().as_secs_f64() * 1000.0 / 100.0;

    // 2) 纯序列化：save() 的主要开销。
    let start = Instant::now();
    for _ in 0..100 {
        let _json = serde_json::to_string_pretty(&data).unwrap();
    }
    let serialize_ms = start.elapsed().as_secs_f64() * 1000.0 / 100.0;

    // 3) 完整写操作（快照 + 修改 + 落盘）。
    let store = Store::for_bench(dir.join("data.json"), seed(N));
    let start = Instant::now();
    for _ in 0..20 {
        mutate_and_save(&store, |d| Ok(d.add_folder("C:\\Projects\\extra"))).unwrap();
    }
    let write_ms = start.elapsed().as_secs_f64() * 1000.0 / 20.0;

    // 4) 列表读取（排序）。
    let start = Instant::now();
    for _ in 0..100 {
        let _sorted = data.sorted_by_recent();
    }
    let sort_ms = start.elapsed().as_secs_f64() * 1000.0 / 100.0;

    println!("\n=== 性能基准 @ {N} 条记录 ===");
    println!("快照克隆      : {clone_ms:.3} ms");
    println!("序列化        : {serialize_ms:.3} ms");
    println!("完整写操作    : {write_ms:.3} ms");
    println!("排序读取      : {sort_ms:.3} ms");
    println!(
        "JSON 体积     : {} KB",
        serde_json::to_string(&data).unwrap().len() / 1024
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
#[ignore = "性能基准，需手动运行"]
fn perf_project_detection_bulk() {
    // 启动时为每条记录做项目识别，记录多时是否值得缓存？
    use crate::services::project;

    let start = Instant::now();
    for _ in 0..500 {
        let _ = project::detect(env!("CARGO_MANIFEST_DIR"));
    }
    let detect_ms = start.elapsed().as_secs_f64() * 1000.0 / 500.0;
    println!(
        "\n单次项目识别  : {detect_ms:.4} ms（500 条约 {:.1} ms）",
        detect_ms * 500.0
    );
}

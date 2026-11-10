//! 源码规范检查。
//!
//! 上一轮修复锁中毒问题时，`lib.rs` 里的两处 `lock().unwrap()` 被漏掉，
//! 且都位于启动与关闭路径 —— 恰恰是锁中毒后最不该失效的位置。
//! 这类遗漏靠人工审查不可靠，用静态检查兜底。

use std::path::{Path, PathBuf};

/// 递归收集 `src/` 下的 Rust 源文件（跳过测试文件本身）。
fn rust_sources() -> Vec<PathBuf> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, out);
            } else if path.extension().is_some_and(|e| e == "rs") {
                out.push(path);
            }
        }
    }

    let mut files = Vec::new();
    walk(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src"),
        &mut files,
    );
    files
}

/// 判断某行是否是「故意制造中毒」的测试代码。
fn is_intentional_poison(line: &str) -> bool {
    line.contains("模拟持锁期间 panic") || line.contains("poison")
}

#[test]
fn no_lock_unwrap_outside_tests() {
    let mut offenders = Vec::new();

    for file in rust_sources() {
        let Ok(content) = std::fs::read_to_string(&file) else {
            continue;
        };

        // 粗略按 `#[cfg(test)]` 切分：测试模块之后的内容不参与检查。
        let production = match content.find("#[cfg(test)]") {
            Some(idx) => &content[..idx],
            None => &content[..],
        };

        for (i, line) in production.lines().enumerate() {
            if line.trim_start().starts_with("//") {
                continue;
            }
            if line.contains(".lock().unwrap()") && !is_intentional_poison(line) {
                offenders.push(format!("{}:{}  {}", file.display(), i + 1, line.trim()));
            }
        }
    }

    assert!(
        offenders.is_empty(),
        "发现未使用 Store::data() 的锁调用（会导致 Mutex 中毒后应用永久失效）：\n{}",
        offenders.join("\n")
    );
}

#[test]
fn store_data_accessor_exists() {
    // 保证规范检查的前提成立：存在统一的容忍中毒访问器。
    let store = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/storage/store.rs");
    let content = std::fs::read_to_string(store).expect("无法读取 store.rs");
    assert!(
        content.contains("pub fn data(&self)"),
        "Store 必须提供 data() 访问器"
    );
    assert!(content.contains("into_inner"), "data() 必须容忍锁中毒");
}

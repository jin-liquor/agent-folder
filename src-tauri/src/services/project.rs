//! 项目类型识别。
//!
//! 通过目录下的标记文件判断这是哪类项目，供界面显示对应徽标。
//! 只读取有限层文件是否存在，不做递归遍历，因此可在加载时同步调用。

/// 一个可识别的项目类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProjectKind {
    /// 稳定标识，前端据此选择徽标样式。
    pub id: &'static str,
    /// 展示名，用于提示文案。
    pub label: &'static str,
}

/// 按优先级排列的识别规则。
///
/// 顺序很关键：Tauri / Electron 这类混合项目根目录通常同时有
/// `package.json` 与子目录中的 `Cargo.toml`，必须先判定更具体的一方，
/// 否则会被误判成纯 Node 项目。
const RULES: &[(&str, &[&str])] = &[
    ("tauri", &["src-tauri/Cargo.toml"]),
    ("rust", &["Cargo.toml"]),
    ("node", &["package.json"]),
    (
        "python",
        &["pyproject.toml", "requirements.txt", "setup.py"],
    ),
    ("go", &["go.mod"]),
    ("java", &["pom.xml", "build.gradle", "build.gradle.kts"]),
    ("dotnet", &["*.csproj", "*.sln", "*.fsproj"]),
    ("php", &["composer.json"]),
    ("ruby", &["Gemfile"]),
    ("cpp", &["CMakeLists.txt"]),
];

/// 展示名映射。
fn label_of(id: &str) -> &'static str {
    match id {
        "tauri" => "Tauri",
        "rust" => "Rust",
        "node" => "Node",
        "python" => "Python",
        "go" => "Go",
        "java" => "Java",
        "dotnet" => ".NET",
        "php" => "PHP",
        "ruby" => "Ruby",
        "cpp" => "C/C++",
        _ => "项目",
    }
}

/// 识别目录所属的项目类型。
///
/// 返回 `None` 表示没有命中任何规则（普通文件夹）。
/// 目录不存在或不可读时同样返回 `None`，不向上抛错——
/// 记录可能指向已被删除的文件夹，这不应影响列表展示。
pub fn detect(path: &str) -> Option<ProjectKind> {
    let dir = std::path::Path::new(path);
    if !dir.is_dir() {
        return None;
    }

    for (id, markers) in RULES {
        for marker in *markers {
            let hit = if let Some(ext) = marker.strip_prefix("*.") {
                has_extension(dir, ext)
            } else {
                dir.join(marker).exists()
            };
            if hit {
                return Some(ProjectKind {
                    id,
                    label: label_of(id),
                });
            }
        }
    }
    None
}

/// 判断目录中是否存在指定扩展名的文件（只看一层）。
fn has_extension(dir: &std::path::Path, ext: &str) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        entry
            .path()
            .extension()
            .is_some_and(|value| value.eq_ignore_ascii_case(ext))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_directory_is_not_a_project() {
        assert!(detect("Z:\\definitely-not-here\\nope").is_none());
    }

    /// 本仓库根目录（即 `src-tauri` 的上一级）。
    fn repo_root() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri 应有上一级目录")
            .to_path_buf()
    }

    #[test]
    fn this_repo_is_detected_as_tauri() {
        // 仓库根目录同时有 package.json 与 src-tauri/Cargo.toml，
        // 必须优先判定为 Tauri 而不是 Node。
        let kind = detect(repo_root().to_str().unwrap()).expect("应识别出项目类型");
        assert_eq!(kind.id, "tauri");
    }

    #[test]
    fn crate_dir_alone_is_plain_rust() {
        // src-tauri 自身没有子目录 src-tauri/Cargo.toml，应判定为普通 Rust。
        let kind = detect(env!("CARGO_MANIFEST_DIR")).map(|k| k.id);
        assert_eq!(kind, Some("rust"));
    }

    #[test]
    fn labels_cover_all_rules() {
        for (id, _) in RULES {
            assert_ne!(label_of(id), "项目", "规则 {id} 缺少展示名");
        }
    }
}

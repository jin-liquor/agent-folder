//! 命令行参数分词与引号处理。
//!
//! 用户可以在设置里为每个 CLI 填写「附加参数」。这些参数最终要变成
//! 子进程的 argv，因此必须有一套**确定且可测**的规则，避免：
//!
//! - 参数里的空格被拆成两个；
//! - 未闭合引号被静默忽略；
//! - 交给 `cmd.exe` 时 `&`、`|`、`^` 等元字符被当作控制符执行。
//!
//! 设计约束：
//! - [`split_args`] 与 [`quote_arg`] 是纯函数，不碰文件系统、不启动进程；
//! - 能直接 `CreateProcess` 的路径（真实 exe）用数组传参，**不过 shell**，
//!   因此不需要引号处理；只有退回 `.cmd` shim 时才需要 [`build_cmdline`]。

/// 分词结果的上限：防止用户粘贴超长内容拖垮启动流程。
const MAX_ARGS: usize = 128;

/// 把用户输入的参数串切成 argv。
///
/// 规则：
/// - 空白（空格 / Tab / 换行）分隔参数；
/// - 双引号包裹的片段整体保留，内部可含空格；
/// - 连续两个双引号 `""` 表示一个空参数；
/// - 反斜杠**不做**转义处理（Windows 路径 `C:\a b` 应写成 `"C:\a b"`）；
/// - 未闭合的双引号返回 `Err`，不猜测用户意图；
/// - 控制字符（`\0`、`\r` 等）返回 `Err`。
///
/// 空输入返回空 `Vec`，而不是错误——「不填参数」是合法且常见的情况。
pub fn split_args(input: &str) -> Result<Vec<String>, String> {
    if let Some(bad) = input
        .chars()
        .find(|c| c.is_control() && *c != '\n' && *c != '\t')
    {
        return Err(format!("附加参数包含不可用的控制字符 U+{:04X}", bad as u32));
    }

    let mut args: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut started = false;

    for ch in input.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                // `""` 或 `"x"` 都算「这个参数已经开始」，保证空串参数不被丢弃。
                started = true;
            }
            c if !in_quotes && c.is_whitespace() => {
                if started {
                    args.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            c => {
                current.push(c);
                started = true;
            }
        }
    }

    if in_quotes {
        return Err("附加参数里的双引号没有闭合".into());
    }
    if started {
        args.push(current);
    }

    if args.len() > MAX_ARGS {
        return Err(format!(
            "附加参数过多（{} 个），最多 {MAX_ARGS} 个",
            args.len()
        ));
    }

    Ok(args)
}

/// 按 Windows 命令行规则给单个参数加引号。
///
/// 只有在参数**确实需要**时才加引号，保持命令行可读：
/// - 不含空格 / Tab / 引号 / 元字符 → 原样返回；
/// - 否则用双引号包裹，内部 `"` 转义成 `\"`，紧邻引号的尾部反斜杠加倍。
///
/// 这里的转义规则对应 `CommandLineToArgvW` 与 CRT 的解析约定。
pub fn quote_arg(token: &str) -> String {
    if token.is_empty() {
        return "\"\"".into();
    }

    let needs_quotes = token
        .chars()
        .any(|c| c.is_whitespace() || c == '"' || "&|<>^()%!".contains(c));
    if !needs_quotes {
        return token.to_string();
    }

    let mut out = String::with_capacity(token.len() + 2);
    out.push('"');
    let mut backslashes = 0usize;
    for ch in token.chars() {
        match ch {
            '\\' => {
                backslashes += 1;
                out.push('\\');
            }
            '"' => {
                // 引号前的反斜杠要加倍，再加转义引号。
                for _ in 0..backslashes {
                    out.push('\\');
                }
                backslashes = 0;
                out.push('\\');
                out.push('"');
            }
            c => {
                backslashes = 0;
                out.push(c);
            }
        }
    }
    // 结尾的反斜杠必须加倍，否则会把收尾引号转义掉。
    for _ in 0..backslashes {
        out.push('\\');
    }
    out.push('"');
    out
}

/// 组装交给 `cmd.exe /d /s /c` 的完整命令行。
///
/// 仅在探测退回 `.cmd` shim 时使用；真实 exe 走数组传参，不需要这一步。
pub fn build_cmdline(command: &str, args: &[String]) -> String {
    let mut line = quote_arg(command);
    for arg in args {
        line.push(' ');
        line.push_str(&quote_arg(arg));
    }
    line
}

#[cfg(test)]
mod tests {
    use super::{build_cmdline, quote_arg, split_args};

    #[test]
    fn splits_on_whitespace() {
        assert_eq!(
            split_args("--model opus").unwrap(),
            vec!["--model".to_string(), "opus".to_string()]
        );
        assert_eq!(
            split_args("  --a\t--b\n--c  ").unwrap(),
            vec!["--a".to_string(), "--b".to_string(), "--c".to_string()]
        );
    }

    #[test]
    fn keeps_quoted_segments_together() {
        assert_eq!(
            split_args(r#"--append-system-prompt "a b""#).unwrap(),
            vec!["--append-system-prompt".to_string(), "a b".to_string()]
        );
        assert_eq!(
            split_args(r#"a "b c" d"#).unwrap(),
            vec!["a".to_string(), "b c".to_string(), "d".to_string()]
        );
    }

    #[test]
    fn empty_input_yields_no_args() {
        assert!(split_args("").unwrap().is_empty());
        assert!(split_args("   \t \n ").unwrap().is_empty());
        // 显式空串参数必须保留，否则 `--flag ""` 会退化成 `--flag`。
        assert_eq!(
            split_args(r#"--flag """#).unwrap(),
            vec!["--flag".to_string(), String::new()]
        );
    }

    #[test]
    fn rejects_unclosed_quote() {
        assert!(split_args(r#"--flag "unterminated"#).is_err());
    }

    #[test]
    fn rejects_control_characters() {
        assert!(split_args("--flag \u{0}").is_err());
        assert!(split_args("--flag \u{7}").is_err());
    }

    #[test]
    fn quotes_only_when_needed() {
        assert_eq!(quote_arg("opus"), "opus");
        assert_eq!(quote_arg("a b"), "\"a b\"");
        assert_eq!(quote_arg(""), "\"\"");
        // cmd 元字符必须被引号保护，否则会被当作控制符执行。
        assert_eq!(quote_arg("a&b"), "\"a&b\"");
        assert_eq!(quote_arg("a|b"), "\"a|b\"");
        assert_eq!(quote_arg("a^b"), "\"a^b\"");
    }

    #[test]
    fn escapes_embedded_quotes_and_trailing_backslash() {
        assert_eq!(quote_arg(r#"a"b"#), r#""a\"b""#);
        assert_eq!(quote_arg(r"C:\x y\"), r#""C:\x y\\""#);
        // 无空格的普通路径不加引号。
        assert_eq!(quote_arg(r"C:\plain\dir"), r"C:\plain\dir");
    }

    #[test]
    fn builds_cmdline_for_shim_launch() {
        let line = build_cmdline(
            r"C:\Program Files\cli.cmd",
            &["--model".to_string(), "a b".to_string()],
        );
        assert_eq!(line, r#""C:\Program Files\cli.cmd" --model "a b""#);
    }
}

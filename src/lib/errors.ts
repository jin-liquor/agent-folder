/**
 * 错误信息格式化。
 *
 * 后端返回的错误大多是中文可读文案（如「记录不存在」），可以直接展示；
 * 但少数来自底层库的错误是技术细节，例如 serde_json 的
 * `expected value at line 1 column 16`，对普通用户毫无意义。
 *
 * 这里做一层收敛：识别到已知的技术性错误就替换成用户能理解的说明，
 * 其余原样透出，避免把有用信息也一并吞掉。
 */

/** 已知技术性错误的特征 → 面向用户的说明。 */
const FRIENDLY_RULES: { match: RegExp; message: string }[] = [
  {
    match: /expected value at line|expected ident|trailing characters|EOF while parsing/i,
    message: "文件内容不是合法的 JSON，可能已损坏",
  },
  {
    match: /os error 5\b|拒绝访问|Access is denied/i,
    message: "没有访问权限，请检查文件或目录是否被占用",
  },
  {
    match: /os error 3\b|系统找不到指定的路径|The system cannot find the path/i,
    message: "路径不存在，可能已被移动或删除",
  },
  {
    match: /os error 32\b|另一个程序正在使用|being used by another process/i,
    message: "文件正被其他程序占用，请稍后重试",
  },
  {
    match: /os error 112\b|磁盘空间不足|not enough space/i,
    message: "磁盘空间不足",
  },
];

/** 把任意异常转成可展示的一行文案。 */
export function errorText(error: unknown): string {
  // `null` / `undefined` 直接 String() 会得到 "null" 这种无意义文本。
  if (error === null || error === undefined) return "未知错误";

  // Tauri 的 invoke 失败时直接抛出后端返回的字符串，不是 Error 实例。
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();
  if (!trimmed) return "未知错误";

  for (const rule of FRIENDLY_RULES) {
    if (rule.match.test(trimmed)) return rule.message;
  }
  return trimmed;
}

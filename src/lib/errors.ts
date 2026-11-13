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
import type { Language } from "./i18n";

/** 已知技术性错误的特征 → 面向用户的说明（中英双语）。 */
const FRIENDLY_RULES: { match: RegExp; message: { zh: string; en: string } }[] = [
  {
    match: /expected value at line|expected ident|trailing characters|EOF while parsing/i,
    message: {
      zh: "文件内容不是合法的 JSON，可能已损坏",
      en: "The file is not valid JSON and may be corrupted",
    },
  },
  {
    match: /os error 5\b|拒绝访问|Access is denied/i,
    message: {
      zh: "没有访问权限，请检查文件或目录是否被占用",
      en: "Access denied; check whether the file or folder is in use",
    },
  },
  {
    match: /os error 3\b|系统找不到指定的路径|The system cannot find the path/i,
    message: {
      zh: "路径不存在，可能已被移动或删除",
      en: "The path no longer exists; it may have been moved or deleted",
    },
  },
  {
    match: /os error 32\b|另一个程序正在使用|being used by another process/i,
    message: {
      zh: "文件正被其他程序占用，请稍后重试",
      en: "The file is in use by another program; please try again later",
    },
  },
  {
    match: /os error 112\b|磁盘空间不足|not enough space/i,
    message: {
      zh: "磁盘空间不足",
      en: "Not enough disk space",
    },
  },
];

/**
 * 把任意异常转成可展示的一行文案。
 *
 * `language` 决定替换说明的语言：界面切到英文后，错误提示也应当是英文，
 * 否则用户会在英文界面里看到一整句中文。
 */
export function errorText(error: unknown, language: Language = "zh-CN"): string {
  const english = language === "en-US";
  const unknown = english ? "Unknown error" : "未知错误";

  // `null` / `undefined` 直接 String() 会得到 "null" 这种无意义文本。
  if (error === null || error === undefined) return unknown;

  // Tauri 的 invoke 失败时直接抛出后端返回的字符串，不是 Error 实例。
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();
  if (!trimmed) return unknown;

  for (const rule of FRIENDLY_RULES) {
    if (rule.match.test(trimmed)) {
      return english ? rule.message.en : rule.message.zh;
    }
  }
  return trimmed;
}

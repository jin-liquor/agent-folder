/**
 * 路径与时间字符串工具。
 */

/** 把时间戳转成「几分钟前」这类相对描述。 */
export function timeAgo(ts: number): string {
  if (!ts) return "从未打开";
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 过长的路径截断成 `盘符\…\末两级`，保留辨识度。 */
export function shortenPath(p: string, max = 52): string {
  if (p.length <= max) return p;
  const parts = p.split("\\");
  if (parts.length <= 3) return `${p.slice(0, max - 1)}…`;
  return `${parts[0]}\\…\\${parts.slice(-2).join("\\")}`;
}

/** 取路径最后一段作为展示名。 */
export function baseName(p: string): string {
  const idx = p.lastIndexOf("\\");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

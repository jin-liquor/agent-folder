/**
 * 磁盘索引结果的合并规则。
 *
 * 主窗口与快速启动浮窗都要做同一件事：把磁盘命中里已经保存过的路径剔除，
 * 避免同一个文件夹在一次搜索里出现两遍。抽成纯函数便于单测。
 */
import type { FolderRecord, SearchHit } from "./types";

/** 已保存记录的路径集合（小写，用于大小写不敏感比较）。 */
export function folderPathSet(folders: FolderRecord[]): Set<string> {
  return new Set(folders.map((folder) => folder.path.toLowerCase()));
}

/** 过滤掉已保存路径与重复路径，保持后端给出的相关性顺序。 */
export function excludeKnownPaths(hits: SearchHit[], known: Set<string>): SearchHit[] {
  const seen = new Set(known);
  return hits.filter((hit) => {
    const key = hit.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 文件夹列表的行数据编排：搜索模式与浏览模式的分组规则。
 */
import { useMemo } from "react";
import type { FolderRecord } from "../lib/types";
import { createFolderSearch, hasQuery } from "../lib/search";

/** 列表中的一行：已保存记录，或磁盘扫描出的候选路径。 */
export type Row =
  | { kind: "record"; record: FolderRecord }
  | { kind: "scan"; path: string };

interface Options {
  folders: FolderRecord[];
  query: string;
  scanMode: boolean;
  scanResults: string[];
}

/**
 * 计算当前应展示的行。
 *
 * - 搜索模式：模糊匹配结果 + 尚未保存的扫描结果
 * - 浏览模式：收藏在前，其余按最近打开排序
 */
export function useFolderList({ folders, query, scanMode, scanResults }: Options) {
  const fuse = useMemo(() => createFolderSearch(folders), [folders]);
  const searching = hasQuery(query);

  const rows: Row[] = useMemo(() => {
    if (searching) {
      const matched: Row[] = fuse
        .search(query.trim())
        .map((result) => ({ kind: "record" as const, record: result.item }));
      const priority = (row: Row) =>
        row.kind === "record" ? (row.record.favorite ? 2 : row.record.openCount > 0 ? 1 : 0) : 0;
      matched.sort((a, b) => priority(b) - priority(a));

      const knownPaths = new Set(folders.map((f) => f.path.toLowerCase()));
      const scans: Row[] =
        scanMode && scanResults.length > 0
          ? scanResults
              .filter((path) => !knownPaths.has(path.toLowerCase()))
              .map((path) => ({ kind: "scan", path }))
          : [];

      return [...matched, ...scans];
    }

    const byRecent = (a: FolderRecord, b: FolderRecord) => b.lastOpenedAt - a.lastOpenedAt;
    const favorites = folders
      .filter((f) => f.favorite)
      .sort(byRecent)
      .map<Row>((record) => ({ kind: "record", record }));
    const others = folders
      .filter((f) => !f.favorite)
      .sort(byRecent)
      .map<Row>((record) => ({ kind: "record", record }));

    return [...favorites, ...others];
  }, [folders, fuse, query, searching, scanMode, scanResults]);

  return { rows, searching };
}

/**
 * 文件夹列表的行数据编排：搜索模式与浏览模式的分组规则。
 */
import { useMemo } from "react";
import type { FolderRecord, SearchHit } from "../lib/types";
import { createFolderSearch, hasQuery } from "../lib/search";
import { excludeKnownPaths, folderPathSet } from "../lib/disk";

/** 列表中的一行：已保存记录，或磁盘索引命中。 */
export type Row =
  | { kind: "record"; record: FolderRecord }
  | { kind: "disk"; hit: SearchHit };

/** 搜索模式下最多渲染的记录行，避免一次命中过多拖慢渲染。 */
const MAX_RECORD_ROWS = 60;

interface Options {
  folders: FolderRecord[];
  query: string;
  scanMode: boolean;
  diskHits: SearchHit[];
}

/**
 * 计算当前应展示的行。
 *
 * - 搜索模式：模糊匹配结果（按相关性）+ 尚未保存的磁盘索引命中
 * - 浏览模式：收藏在前，其余按最近打开排序
 */
export function useFolderList({ folders, query, scanMode, diskHits }: Options) {
  const fuse = useMemo(() => createFolderSearch(folders), [folders]);
  const searching = hasQuery(query);

  const rows: Row[] = useMemo(() => {
    if (searching) {
      const matched: Row[] = fuse
        .search(query.trim())
        .slice(0, MAX_RECORD_ROWS)
        .map((result) => ({ kind: "record" as const, record: result.item }));

      const disks: Row[] = scanMode
        ? excludeKnownPaths(diskHits, folderPathSet(folders)).map((hit) => ({
            kind: "disk" as const,
            hit,
          }))
        : [];

      return [...matched, ...disks];
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
  }, [folders, fuse, query, searching, scanMode, diskHits]);

  return { rows, searching };
}

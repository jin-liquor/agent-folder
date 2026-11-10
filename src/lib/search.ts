/**
 * 搜索相关工具：模糊搜索配置与关键词高亮。
 */
import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import type { FolderRecord } from "./types";

/** 记录搜索使用的 Fuse 配置。 */
export const FUSE_OPTIONS: IFuseOptions<FolderRecord> = {
  keys: ["name", "path", "tags"],
  includeMatches: true,
  threshold: 0.4,
  ignoreLocation: true,
};

/** 为一组记录创建搜索引擎。 */
export function createFolderSearch(folders: FolderRecord[]) {
  return new Fuse(folders, FUSE_OPTIONS);
}

/** 转义正则元字符，避免用户输入 `(` 之类字符时崩溃。 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把查询串拆成用于高亮的关键词列表。 */
export function queryTokens(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
}

/** 查询串中是否包含有效关键词。 */
export function hasQuery(query: string): boolean {
  return query.trim().length > 0;
}

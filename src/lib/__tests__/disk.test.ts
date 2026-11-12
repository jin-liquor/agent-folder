import { describe, expect, it } from "vitest";
import { excludeKnownPaths, folderPathSet } from "../disk";
import type { FolderRecord, SearchHit } from "../types";

function hit(path: string, name = path): SearchHit {
  return { path, name, depth: 2, score: 100 };
}

function record(path: string): FolderRecord {
  return {
    id: path,
    path,
    name: path,
    tags: [],
    favorite: false,
    openCount: 0,
    lastOpenedAt: 0,
    createdAt: 0,
  };
}

describe("excludeKnownPaths", () => {
  it("剔除已保存路径，忽略大小写与斜杠差异带来的大小写问题", () => {
    const known = folderPathSet([record("C:\\Projects\\Keep")]);
    const hits = [hit("c:\\projects\\keep"), hit("C:\\Projects\\New")];

    const kept = excludeKnownPaths(hits, known);
    expect(kept).toHaveLength(1);
    expect(kept[0].path).toBe("C:\\Projects\\New");
  });

  it("同时去掉磁盘组内部的重复路径", () => {
    const kept = excludeKnownPaths(
      [hit("E:\\work\\a"), hit("e:\\WORK\\A"), hit("E:\\work\\b")],
      new Set<string>(),
    );
    expect(kept.map((item) => item.path)).toEqual(["E:\\work\\a", "E:\\work\\b"]);
  });

  it("不修改传入的集合，便于复用同一份已知路径", () => {
    const known = new Set(["c:\\a"]);
    excludeKnownPaths([hit("C:\\b")], known);
    expect(known.size).toBe(1);
  });

  it("空输入返回空数组", () => {
    expect(excludeKnownPaths([], new Set())).toEqual([]);
  });
});

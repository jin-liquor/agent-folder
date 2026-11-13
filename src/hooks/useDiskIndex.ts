/**
 * 磁盘索引查询。
 *
 * 与旧的 `useScanSearch` 的区别：查询只走内存索引，不触发任何文件系统遍历，
 * 因此防抖可以压到 120 ms；构建进度通过状态轮询单独获取。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getIndexStatus, searchIndex } from "../lib/commands";
import type { IndexSearchResult, IndexStatus, SearchHit } from "../lib/types";

/** 输入停止后多久发起查询（毫秒）。 */
const DEBOUNCE_MS = 120;
/** 触发查询的最短关键词长度。 */
const MIN_QUERY_LENGTH = 2;
/** 索引构建中的状态轮询间隔。 */
const STATUS_POLL_MS = 1200;

/**
 * 未命中时的空数组。
 *
 * 写成模块级常量：每次渲染都新建一个空数组会让下游依赖它的
 * `useMemo` 全部失效，列表随之整片重建。
 */
const NO_HITS: SearchHit[] = [];

export function useDiskIndex(query: string, enabled: boolean, limit = 20) {
  const [result, setResult] = useState<IndexSearchResult | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [searching, setSearching] = useState(false);
  // 递增 generation 丢弃过期响应，避免快速输入时结果乱序。
  const generation = useRef(0);
  const trimmed = query.trim();
  const active = enabled && trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    const current = ++generation.current;

    if (!active) {
      setSearching(false);
      setResult(null);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchIndex(trimmed, limit)
        .then((next) => {
          if (generation.current === current) setResult(next);
        })
        .catch(() => {
          if (generation.current === current) setResult(null);
        })
        .finally(() => {
          if (generation.current === current) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      if (generation.current === current) generation.current++;
    };
  }, [active, trimmed, limit]);

  // 构建中时轮询状态；就绪后停止，避免常驻定时器。
  useEffect(() => {
    if (!enabled) {
      setIndexStatus(null);
      return;
    }

    let alive = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const status = await getIndexStatus();
        if (!alive) return;
        setIndexStatus(status);
        if (!status.ready && status.building) {
          timer = window.setTimeout(poll, STATUS_POLL_MS);
        }
      } catch {
        // 状态查询失败不应影响搜索本身，但也不能就此停轮询：
        // 否则索引状态会永久停在「正在建立」。
        if (alive) {
          timer = window.setTimeout(poll, STATUS_POLL_MS);
        }
      }
    };

    void poll();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled]);

  /** 搜索响应里也带构建状态，索引刚就绪时界面能立刻反映。 */
  const status: IndexStatus | null = useMemo(() => {
    if (indexStatus) return indexStatus;
    if (!result) return null;
    return {
      ready: result.ready,
      building: result.building,
      entries: result.entries,
      scanned: result.scanned,
      builtAt: 0,
      roots: [],
      truncated: result.truncated,
      warnings: result.warnings,
      error: null,
    };
  }, [indexStatus, result]);

  return {
    hits: active ? (result?.hits ?? NO_HITS) : NO_HITS,
    status,
    searching: active && searching,
  };
}

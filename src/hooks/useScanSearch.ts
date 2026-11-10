/**
 * 磁盘扫描的防抖搜索：仅在扫描模式且关键词足够长时触发。
 */
import { useEffect, useRef, useState } from "react";
import { scanFolders } from "../lib/commands";

/** 输入停止后多久发起扫描（毫秒）。 */
const DEBOUNCE_MS = 350;
/** 触发扫描的最短关键词长度。 */
const MIN_QUERY_LENGTH = 2;

export function useScanSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  // 用递增的 generation 丢弃过期请求，避免快速输入时结果乱序。
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;

    if (!enabled || query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setScanning(false);
      return;
    }

    setScanning(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await scanFolders(query.trim());
        if (generation.current === current) setResults(found);
      } catch {
        if (generation.current === current) setResults([]);
      } finally {
        if (generation.current === current) setScanning(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      if (generation.current === current) generation.current++;
    };
  }, [query, enabled]);

  return { results, scanning };
}

/**
 * 轻提示（Toast）状态管理：显示一段时间后自动消失。
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 提示默认停留时长（毫秒）。 */
const DEFAULT_DURATION = 4000;

export function useToast(duration = DEFAULT_DURATION) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (text: string) => {
      setMessage(text);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(null), duration);
    },
    [duration],
  );

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setMessage(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message, show, hide };
}

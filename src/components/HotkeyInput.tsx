/**
 * 全局快捷键录制控件。
 *
 * 点击后进入录制态，按下组合键即捕获。格式与后端
 * `tauri_plugin_global_shortcut::Shortcut::from_str` 保持一致，
 * 例如 `Ctrl+Alt+V`、`Ctrl+Shift+Space`。
 */
import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (hotkey: string) => void;
  /** 保存失败时的错误信息，用于就地提示。 */
  error?: string | null;
}

/** 可识别的修饰键。 */
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

/** 浏览器键名 → 插件识别的键名。 */
function normalizeKey(key: string): string | null {
  if (MODIFIER_KEYS.has(key)) return null;
  if (key === " ") return "Space";
  if (key === "Escape") return "Escape";
  if (key === "ArrowUp") return "Up";
  if (key === "ArrowDown") return "Down";
  if (key === "ArrowLeft") return "Left";
  if (key === "ArrowRight") return "Right";
  if (key.length === 1) return key.toUpperCase();
  // F1–F12、Tab、Enter 等直接沿用。
  return key;
}

/** 把键盘事件转成插件要求的字符串；缺少修饰键或主键时返回 null。 */
export function formatHotkey(event: KeyboardEvent): string | null {
  const key = normalizeKey(event.key);
  if (!key) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");

  // 只按单个普通键会与日常输入冲突，必须带修饰键。
  if (parts.length === 0) return null;

  parts.push(key);
  return parts.join("+");
}

export default function HotkeyInput({ value, onChange, error }: Props) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecording(false);
        setHint(null);
        return;
      }

      const formatted = formatHotkey(event);
      if (!formatted) {
        setHint("需要至少一个修饰键（Ctrl / Alt / Shift）");
        return;
      }
      setRecording(false);
      setHint(null);
      onChange(formatted);
    };

    // 捕获阶段拦截，避免触发全局键盘导航。
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onChange]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        ref={buttonRef}
        type="button"
        aria-label="录制全局快捷键"
        onClick={() => {
          setRecording((on) => !on);
          setHint(null);
        }}
        className={`flex h-8 items-center gap-1 rounded-lg border px-2 transition ${
          recording
            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
            : "border-[var(--glass-border)] hover:border-[var(--text-secondary)]"
        }`}
      >
        {recording ? (
          <span className="text-[11px] text-[var(--accent)]">请按下组合键…</span>
        ) : (
          value.split("+").map((key) => (
            <span key={key} className="kbd">
              {key}
            </span>
          ))
        )}
      </button>

      {(hint || error) && (
        <span role="alert" className="max-w-[190px] text-right text-[10px] text-red-500">
          {hint ?? error}
        </span>
      )}
    </div>
  );
}

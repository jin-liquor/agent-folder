/**
 * 全局快捷键录制控件。
 *
 * 点击后进入录制态，按下组合键即捕获。格式与后端
 * `tauri_plugin_global_shortcut::Shortcut::from_str` 保持一致，
 * 例如 `Ctrl+Alt+V`、`Ctrl+Shift+Space`。
 */
import { useEffect, useRef, useState } from "react";
import type { Language } from "../lib/i18n";

interface Props {
  value: string;
  onChange: (hotkey: string) => void;
  /** 保存失败时的错误信息，用于就地提示。 */
  error?: string | null;
  /**
   * 允许清空成「未设置」（表示主动禁用该快捷键）。
   *
   * 全局主窗口快捷键不允许为空——空值会让注册必然失败；
   * 快速启动快捷键允许为空，用户可能就想把它关掉。
   */
  allowEmpty?: boolean;
  language: Language;
}

/** 可识别的修饰键。 */
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

/**
 * 允许单独作为修饰键使用的按键。
 *
 * Win 键（`Meta` → `Super`）在 Windows 上是合法的独立修饰键，
 * 例如默认的 `Super+Space`；Ctrl / Alt / Shift 单独按也会被录制，
 * 但那样会和日常输入冲突，因此仍然只认 Win 键。
 */
const STANDALONE_MODIFIERS = new Set(["Meta"]);

/** 浏览器键名 → 插件识别的键名。 */
function normalizeKey(key: string): string | null {
  if (MODIFIER_KEYS.has(key)) {
    // 修饰键只有在允许单独使用时才转成名称，否则返回 null（继续等主键）。
    return STANDALONE_MODIFIERS.has(key) ? (key === "Meta" ? "Super" : key) : null;
  }
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
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");

  const key = normalizeKey(event.key);

  // 单独按下 Win 键：把它本身当作主键，产出 `Super`。
  if (key === "Super") {
    return "Super";
  }

  if (!key) return null;

  // 只按单个普通键会与日常输入冲突，必须带修饰键。
  if (parts.length === 0) return null;

  parts.push(key);
  return parts.join("+");
}

export default function HotkeyInput({ value, onChange, error, allowEmpty = false, language }: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
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
        setHint(text("需要至少一个修饰键（Ctrl / Alt / Shift / Win）", "Use at least one modifier (Ctrl / Alt / Shift / Win)"));
        return;
      }
      setRecording(false);
      setHint(null);
      onChange(formatted);
    };

    // 捕获阶段拦截，避免触发全局键盘导航。
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onChange, language]);

  return (
    <div className="flex w-[180px] max-w-full flex-col items-stretch gap-1">
      <button
        ref={buttonRef}
        type="button"
        aria-label={text("录制全局快捷键", "Record global shortcut")}
        onClick={() => {
          setRecording((on) => !on);
          setHint(null);
        }}
        className={`flex min-h-8 w-full items-center justify-end gap-1 rounded-lg border px-2 transition ${
          recording
            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
            : "border-[var(--glass-border)] hover:border-[var(--text-secondary)]"
        }`}
      >
        {recording ? (
          <span className="text-[11px] text-[var(--accent)]">{text("请按下组合键…", "Press a key combination…")}</span>
        ) : value.trim() === "" ? (
          <span className="text-[11px] text-[var(--text-secondary)]">{text("未设置", "Not set")}</span>
        ) : (
          value.split("+").map((key) => (
            <span key={key} className="kbd">
              {key}
            </span>
          ))
        )}
      </button>

      {allowEmpty && !recording && (
        <button
          type="button"
          onClick={() => {
            setRecording(false);
            setHint(null);
            onChange("");
          }}
          disabled={value.trim() === ""}
          className="self-end text-[10px] text-[var(--text-secondary)] transition hover:text-[var(--danger)] disabled:opacity-40 disabled:hover:text-[var(--text-secondary)]"
        >
          {text("清空（禁用）", "Clear (disable)")}
        </button>
      )}

      {(hint || error) && (
        <span role="alert" className="max-w-[190px] text-right text-[10px] text-red-500">
          {hint ?? error}
        </span>
      )}
    </div>
  );
}

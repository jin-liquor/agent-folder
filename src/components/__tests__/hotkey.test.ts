/**
 * 快捷键字符串格式化的单元测试。
 *
 * 重点：产出必须能被 Rust 侧
 * `tauri_plugin_global_shortcut::Shortcut::from_str` 正确解析，
 * 因此修饰键名称与主键大小写都要严格匹配。
 */
import { describe, expect, it } from "vitest";
import { formatHotkey } from "../HotkeyInput";

/** 造一个只带指定字段的 KeyboardEvent，避免依赖 DOM 环境。 */
function key(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...init,
  } as KeyboardEvent;
}

describe("formatHotkey", () => {
  it("combines modifiers in a stable order", () => {
    expect(formatHotkey(key({ key: "v", ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+V");
    expect(formatHotkey(key({ key: "v", altKey: true, ctrlKey: true }))).toBe("Ctrl+Alt+V");
    expect(
      formatHotkey(key({ key: "k", shiftKey: true, ctrlKey: true, altKey: true })),
    ).toBe("Ctrl+Alt+Shift+K");
  });

  it("rejects a bare key without modifiers", () => {
    // 单键全局热键会与日常输入冲突，必须拒绝。
    expect(formatHotkey(key({ key: "a" }))).toBeNull();
  });

  it("rejects modifier-only presses", () => {
    expect(formatHotkey(key({ key: "Control", ctrlKey: true }))).toBeNull();
    expect(formatHotkey(key({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("maps special keys to plugin names", () => {
    expect(formatHotkey(key({ key: " ", ctrlKey: true }))).toBe("Ctrl+Space");
    expect(formatHotkey(key({ key: "ArrowUp", ctrlKey: true }))).toBe("Ctrl+Up");
    expect(formatHotkey(key({ key: "F5", ctrlKey: true }))).toBe("Ctrl+F5");
  });

  it("uppercases single letters", () => {
    expect(formatHotkey(key({ key: "j", ctrlKey: true }))).toBe("Ctrl+J");
  });

  it("uses Super for the meta key", () => {
    expect(formatHotkey(key({ key: "p", metaKey: true }))).toBe("Super+P");
  });
});

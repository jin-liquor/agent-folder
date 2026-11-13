/**
 * 全局键盘导航的按键归属判定。
 *
 * 重点：行内图标按钮也是 `<button>`，聚焦后按回车应触发按钮本身，
 * 而不是被全局导航改成「用默认编辑器打开」；文本输入框则完全独占键盘。
 */
import { describe, expect, it } from "vitest";
import { enterBelongsToControl, isTextInput } from "../useKeyboardNav";

describe("isTextInput", () => {
  it("treats text-entry controls as typing", () => {
    expect(isTextInput({ tagName: "INPUT" })).toBe(true);
    expect(isTextInput({ tagName: "SELECT" })).toBe(true);
    expect(isTextInput({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextInput({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("does not treat buttons or rows as typing", () => {
    expect(isTextInput({ tagName: "BUTTON" })).toBe(false);
    expect(isTextInput({ tagName: "DIV" })).toBe(false);
    expect(isTextInput(null)).toBe(false);
    expect(isTextInput(undefined)).toBe(false);
  });

  it("ignores the case of the tag name", () => {
    expect(isTextInput({ tagName: "input" })).toBe(true);
  });
});

describe("enterBelongsToControl", () => {
  it("gives Enter to buttons", () => {
    // 行内的「启动 Codex」等按钮聚焦后，回车必须触发按钮本身。
    expect(enterBelongsToControl({ tagName: "BUTTON" })).toBe(true);
  });

  it("gives Enter to text-entry controls", () => {
    expect(enterBelongsToControl({ tagName: "INPUT" })).toBe(true);
    expect(enterBelongsToControl({ tagName: "TEXTAREA" })).toBe(true);
  });

  it("leaves Enter to the global navigation elsewhere", () => {
    expect(enterBelongsToControl({ tagName: "DIV" })).toBe(false);
    expect(enterBelongsToControl(null)).toBe(false);
  });
});

/**
 * CLI 启动模式预设的显示名。
 *
 * 重点：内置预设的名字写在代码里，英文界面必须换成 `nameEn`，
 * 否则下拉栏里会露出「默认」「高风险」这类中文。
 */
import { describe, expect, it } from "vitest";
import { presetLabel } from "../CliPresetEditor";
import { BUILTIN_PRESETS, type CliAgentId } from "../../lib/types";

const AGENTS: CliAgentId[] = ["codex", "claude", "omp", "opencode"];

describe("presetLabel", () => {
  it("uses the English name in the English interface", () => {
    for (const agent of AGENTS) {
      for (const preset of BUILTIN_PRESETS[agent]) {
        expect(preset.nameEn).toBeTruthy();
        expect(presetLabel(preset, "en-US")).toBe(preset.nameEn);
      }
    }
  });

  it("uses the Chinese name in the Chinese interface", () => {
    for (const agent of AGENTS) {
      for (const preset of BUILTIN_PRESETS[agent]) {
        expect(presetLabel(preset, "zh-CN")).toBe(preset.name);
      }
    }
  });

  it("keeps user presets as they are", () => {
    // 用户自建预设只有一种语言的名字，不提供 nameEn。
    const custom = { id: "user-1", name: "我的模式", args: "", builtin: false };
    expect(presetLabel(custom, "en-US")).toBe("我的模式");
    expect(presetLabel(custom, "zh-CN")).toBe("我的模式");
  });
});

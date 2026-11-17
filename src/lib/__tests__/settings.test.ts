/**
 * 设置归一化的纯逻辑。
 *
 * 与 Rust `model::settings::AppSettings::normalize` 的口径一致：
 * 非法值回落到默认值，合法值（尤其是用户自定值）必须原样保留。
 */
import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../settings";
import {
  DEFAULT_INDEX_REFRESH_MINUTES,
  DEFAULT_SETTINGS,
  EXPLORER_EDITOR_ID,
  indexIntervalLabel,
  INDEX_REFRESH_MINUTES,
  normalizeIndexRefreshMinutes,
} from "../types";

describe("normalizeSettings", () => {
  it("fills missing fields from defaults", () => {
    const settings = normalizeSettings({});
    expect(settings.indexAutoRefresh).toBe(true);
    expect(settings.indexRefreshMinutes).toBe(DEFAULT_INDEX_REFRESH_MINUTES);
    expect(settings.scanEnabled).toBe(true);
  });

  it("keeps a valid auto-index interval", () => {
    expect(normalizeSettings({ indexRefreshMinutes: 1440 }).indexRefreshMinutes).toBe(1440);
    expect(normalizeSettings({ indexRefreshMinutes: 15 }).indexRefreshMinutes).toBe(15);
  });

  it("falls back for an out-of-range auto-index interval", () => {
    // 0 与任意未列出的数值都会让下拉框出现空白项，必须回落。
    for (const value of [0, 7, 45, -30, Number.NaN]) {
      expect(normalizeSettings({ indexRefreshMinutes: value }).indexRefreshMinutes).toBe(
        DEFAULT_INDEX_REFRESH_MINUTES,
      );
    }
  });

  it("accepts the explorer Enter action", () => {
    expect(normalizeSettings({ quickEnterAction: "explorer" }).quickEnterAction).toBe("explorer");
  });

  it("rejects an unknown Enter action", () => {
    expect(normalizeSettings({ quickEnterAction: "sublime" as never }).quickEnterAction).toBe(
      DEFAULT_SETTINGS.quickEnterAction,
    );
  });

  it("keeps an explicit auto-index switch value", () => {
    expect(normalizeSettings({ indexAutoRefresh: false }).indexAutoRefresh).toBe(false);
  });
});

describe("index interval helpers", () => {
  it("only accepts listed intervals", () => {
    for (const minutes of INDEX_REFRESH_MINUTES) {
      expect(normalizeIndexRefreshMinutes(minutes)).toBe(minutes);
    }
    expect(normalizeIndexRefreshMinutes(0)).toBe(DEFAULT_INDEX_REFRESH_MINUTES);
    expect(normalizeIndexRefreshMinutes(undefined)).toBe(DEFAULT_INDEX_REFRESH_MINUTES);
  });

  it("labels intervals in the current language", () => {
    expect(indexIntervalLabel(15, false)).toBe("15 分钟");
    expect(indexIntervalLabel(60, false)).toBe("1 小时");
    expect(indexIntervalLabel(1440, true)).toBe("24 hours");
    expect(indexIntervalLabel(120, true)).toBe("2 hours");
  });
});

describe("explorer editor id", () => {
  it("matches the backend constant", () => {
    // 后端 `EXPLORER_EDITOR_ID` 是 "explorer"，改名会同时打断默认编辑器与快速启动。
    expect(EXPLORER_EDITOR_ID).toBe("explorer");
  });
});

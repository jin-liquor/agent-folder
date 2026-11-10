/**
 * 错误文案格式化的单元测试。
 *
 * 目标：技术性错误被替换成可读说明，业务错误原样透出，
 * 空值有兜底 —— 三件事都不能互相干扰。
 */
import { describe, expect, it } from "vitest";
import { errorText } from "../errors";

describe("errorText", () => {
  it("passes through business messages unchanged", () => {
    // 后端返回的中文文案本身就可读，不应被改写。
    expect(errorText("记录不存在")).toBe("记录不存在");
    expect(errorText("名称不能为空")).toBe("名称不能为空");
  });

  it("handles Tauri string rejections", () => {
    // Tauri 的 invoke 失败会直接抛出字符串，而非 Error 实例。
    expect(errorText("文件夹不存在: D:\\gone")).toBe("文件夹不存在: D:\\gone");
  });

  it("translates JSON parse errors", () => {
    expect(errorText("文件格式不正确：expected value at line 1 column 16")).toBe(
      "文件内容不是合法的 JSON，可能已损坏",
    );
    expect(errorText("trailing characters at line 3")).toBe(
      "文件内容不是合法的 JSON，可能已损坏",
    );
  });

  it("translates common OS errors", () => {
    expect(errorText("写入数据失败：拒绝访问。 (os error 5)")).toBe(
      "没有访问权限，请检查文件或目录是否被占用",
    );
    expect(errorText("The system cannot find the path specified. (os error 3)")).toBe(
      "路径不存在，可能已被移动或删除",
    );
    expect(errorText("being used by another process. (os error 32)")).toBe(
      "文件正被其他程序占用，请稍后重试",
    );
  });

  it("extracts message from Error instances", () => {
    expect(errorText(new Error("启动编辑器失败"))).toBe("启动编辑器失败");
  });

  it("falls back for empty input", () => {
    expect(errorText("")).toBe("未知错误");
    expect(errorText("   ")).toBe("未知错误");
    expect(errorText(null)).toBe("未知错误");
    expect(errorText(undefined)).toBe("未知错误");
  });

  it("does not swallow unknown technical detail", () => {
    // 未知错误仍然保留，便于排查；只是已知类型才被改写。
    expect(errorText("some unexpected failure xyz")).toBe("some unexpected failure xyz");
  });
});

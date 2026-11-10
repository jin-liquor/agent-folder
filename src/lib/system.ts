/**
 * 窗口与系统能力封装（非 `invoke` 类）。
 *
 * 与 `commands.ts` 分开的原因：这里走的是 Tauri 的 JS API
 * （窗口控制、对话框、剪贴板、自启动），不是自定义后端命令。
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import * as autostart from "@tauri-apps/plugin-autostart";

const currentWindow = () => getCurrentWindow();

/** 最小化到系统托盘（隐藏窗口，进程继续运行）。 */
export const hideWindow = () => currentWindow().hide();

/** 关闭窗口；`close_to_tray` 开启时后端会拦截为隐藏。 */
export const closeWindow = () => currentWindow().close();

/** 拖拽窗口（无边框窗口靠它移动）。 */
export const startDragging = () => currentWindow().startDragging();

/** 弹出文件夹选择框，取消时返回 `null`。 */
export async function pickFolder(): Promise<string | null> {
  const picked = await openDialog({ directory: true, title: "选择文件夹" });
  return typeof picked === "string" ? picked : null;
}

/** 弹出保存文件对话框，取消时返回 `null`。 */
export async function pickSavePath(
  defaultName: string,
  filters: { name: string; extensions: string[] }[] = [],
): Promise<string | null> {
  const picked = await saveDialog({
    title: "导出数据",
    defaultPath: defaultName,
    filters,
  });
  return typeof picked === "string" ? picked : null;
}

/** 弹出打开文件对话框，取消时返回 `null`。 */
export async function pickOpenPath(
  filters: { name: string; extensions: string[] }[] = [],
): Promise<string | null> {
  const picked = await openDialog({ title: "选择要导入的文件", filters });
  return typeof picked === "string" ? picked : null;
}

/** 写入系统剪贴板。 */
export const copyText = (text: string) => writeText(text);

/** 开关开机自启。 */
export async function setAutostart(enabled: boolean): Promise<void> {
  if (enabled) await autostart.enable();
  else await autostart.disable();
}

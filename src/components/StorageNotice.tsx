import { useState } from "react";
import * as commands from "../lib/commands";
import { errorText } from "../lib/errors";
import { pickSavePath } from "../lib/system";
import type { StorageStatus } from "../lib/types";
import { CheckIcon, WarningIcon } from "./Icons";

const JSON_FILTER = [{ name: "JSON 文件", extensions: ["json"] }];

interface Props {
  status: StorageStatus | null;
  onChanged: () => Promise<void>;
}

export default function StorageNotice({ status, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!status?.warning) return null;

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } catch (error: unknown) {
      window.alert(`${label}失败：${errorText(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const revealBackup = () => {
    const backupPath = status.backupPath;
    if (!backupPath) return;
    void run("定位备份", () => commands.revealInExplorer(backupPath));
  };

  const exportBackup = () => {
    if (!status.backupPath) return;
    void run("导出备份", async () => {
      const path = await pickSavePath("agent-folder-recovery.json", JSON_FILTER);
      if (!path) return;
      await commands.exportStorageBackup(path);
      window.alert("备份已导出，可用于离线保存或人工检查。");
    });
  };

  const recoverBackup = () => {
    void run("恢复备份", async () => {
      const count = await commands.recoverStorageBackup();
      await onChanged();
      window.alert(`已恢复 ${count} 条记录。`);
    });
  };

  const reload = () => {
    void run("重新加载", async () => {
      const count = await commands.reloadStorageData();
      await onChanged();
      window.alert(`已重新加载 ${count} 条记录。`);
    });
  };

  return (
    <div
      role="status"
      className={`mx-3 mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
        status.readOnly
          ? "border-red-500/30 bg-red-500/8 text-red-500"
          : "border-amber-500/30 bg-amber-500/8 text-amber-600"
      }`}
    >
      {status.readOnly ? <WarningIcon size={14} /> : <CheckIcon size={14} />}
      <div className="min-w-0 flex-1 break-words">
        <div>{status.warning}</div>
        {status.readOnly && (
          <div className="mt-0.5 font-medium">当前不会覆盖原数据文件，请先处理该问题后再修改数据。</div>
        )}
        {status.backupPath && <div className="mt-0.5 opacity-80">备份位置：{status.backupPath}</div>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {status.backupPath && (
            <>
              <button type="button" onClick={revealBackup} disabled={busy !== null} className="rounded border border-current px-2 py-1 disabled:opacity-50">
                定位备份
              </button>
              <button type="button" onClick={exportBackup} disabled={busy !== null} className="rounded border border-current px-2 py-1 disabled:opacity-50">
                导出备份
              </button>
              <button type="button" onClick={recoverBackup} disabled={busy !== null} className="rounded border border-current px-2 py-1 disabled:opacity-50">
                恢复备份
              </button>
            </>
          )}
          <button type="button" onClick={reload} disabled={busy !== null} className="rounded border border-current px-2 py-1 disabled:opacity-50">
            {busy === "重新加载" ? "重新加载中…" : "重新加载"}
          </button>
        </div>
      </div>
    </div>
  );
}

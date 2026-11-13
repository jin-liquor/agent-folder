import { useState } from "react";
import * as commands from "../lib/commands";
import { errorText } from "../lib/errors";
import { pickSavePath } from "../lib/system";
import { type Language } from "../lib/i18n";
import type { StorageStatus } from "../lib/types";
import { CheckIcon, WarningIcon } from "./Icons";

function warningText(warning: string, english: boolean): string {
  if (!english) return warning;
  if (warning === "数据文件损坏，已保留原文件并创建备份；当前使用空数据启动") {
    return "The data file was corrupted. The original was preserved and backed up; the app started with empty data.";
  }
  if (warning === "corrupt") return "Storage recovery is required.";
  const patterns: Array<[RegExp, string]> = [
    [/^无法创建数据目录：/, "Unable to create the data directory: "],
    [/^迁移旧数据失败：无法复制旧数据文件：(.*)$/, "Legacy data migration failed; unable to copy the legacy data file: $1"],
    [/^迁移旧数据失败：/, "Legacy data migration failed: "],
    [/^无法读取数据文件：(.*)，已启用只读保护$/, "Unable to read the data file: $1; read-only protection is enabled"],
    [/^数据文件损坏且无法创建备份：(.*)，已启用只读保护$/, "The data file was corrupted and could not be backed up: $1; read-only protection is enabled"],
    [/^数据文件版本 (\d+) 高于当前支持版本 (\d+)，已启用只读保护；请升级应用后再修改数据$/, "Data file version $1 is newer than the supported version $2; upgrade the app before editing data"],
  ];
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(warning)) return warning.replace(pattern, replacement);
  }
  return warning;
}

interface Props {
  status: StorageStatus | null;
  onChanged: () => Promise<void>;
  language: Language;
}

export default function StorageNotice({ status, onChanged, language }: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
  const [busy, setBusy] = useState<string | null>(null);
  if (!status?.warning) return null;

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } catch (error: unknown) {
      window.alert(`${label}${text("失败", " failed")}: ${errorText(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const revealBackup = () => {
    const backupPath = status.backupPath;
    if (!backupPath) return;
    void run(text("定位备份", "Locate backup"), () => commands.revealInExplorer(backupPath));
  };

  const exportBackup = () => {
    if (!status.backupPath) return;
    void run(text("导出备份", "Export backup"), async () => {
      const path = await pickSavePath(
        "agent-folder-recovery.json",
        [{ name: text("JSON 文件", "JSON files"), extensions: ["json"] }],
      );
      if (!path) return;
      await commands.exportStorageBackup(path);
      window.alert(text("备份已导出，可用于离线保存或人工检查。", "Backup exported for offline storage or manual inspection."));
    });
  };

  const recoverBackup = () => {
    void run(text("恢复备份", "Restore backup"), async () => {
      const count = await commands.recoverStorageBackup();
      await onChanged();
      window.alert(text(`已恢复 ${count} 条记录。`, `Restored ${count} records.`));
    });
  };

  const reload = () => {
    void run(text("重新加载", "Reload"), async () => {
      const count = await commands.reloadStorageData();
      await onChanged();
      window.alert(text(`已重新加载 ${count} 条记录。`, `Reloaded ${count} records.`));
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
        <div>{warningText(status.warning, english)}</div>
        {status.readOnly && (
          <div className="mt-0.5 font-medium">{text("当前不会覆盖原数据文件，请先处理该问题后再修改数据。", "The original data file will not be overwritten. Resolve this issue before changing data.")}</div>
        )}
        {status.backupPath && <div className="mt-0.5 opacity-80">{text("备份位置：", "Backup location: ")}{status.backupPath}</div>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {status.backupPath && (
            <>
              <button type="button" onClick={revealBackup} disabled={busy !== null} className="rounded border border-current px-2 py-1 disabled:opacity-50">
                {text("定位备份", "Locate backup")}
              </button>
              <button type="button" onClick={exportBackup} disabled={busy !== null} className="rounded border border-current px-2 py-1 disabled:opacity-50">
                {text("导出备份", "Export backup")}
              </button>
              <button type="button" onClick={recoverBackup} disabled={busy !== null} className="rounded border border-current px-2 py-1 disabled:opacity-50">
                {text("恢复备份", "Restore backup")}
              </button>
            </>
          )}
          <button type="button" onClick={reload} disabled={busy !== null} className="rounded border border-current px-2 py-1 disabled:opacity-50">
            {busy === text("重新加载", "Reload") ? text("重新加载中…", "Reloading…") : text("重新加载", "Reload")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 数据导入导出控件。
 *
 * 导出用于备份或换机迁移；导入是**合并**而非覆盖，已存在的路径会被跳过。
 */
import { useState } from "react";
import * as commands from "../lib/commands";
import { errorText } from "../lib/errors";
import type { Language } from "../lib/i18n";
import { pickOpenPath, pickSavePath } from "../lib/system";

interface Props {
  /** 操作完成后通知外层刷新列表与提示。 */
  onImported: () => void;
  onToast: (message: string) => void;
  language: Language;
}

const JSON_FILTER = [{ name: "JSON 文件", extensions: ["json"] }];

/** 导出文件的默认文件名，带日期便于区分多次备份。 */
function defaultFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `agent-folder-${stamp}.json`;
}

export default function DataPortControls({ onImported, onToast, language }: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const handleExport = async () => {
    setBusy("export");
    try {
      const path = await pickSavePath(defaultFileName(), JSON_FILTER);
      if (!path) return;
      const count = await commands.exportData(path);
      onToast(text(`已导出 ${count} 条记录`, `Exported ${count} records`));
    } catch (error) {
      onToast(text(`导出失败：${errorText(error, language)}`, `Export failed: ${errorText(error, language)}`));
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setBusy("import");
    try {
      const path = await pickOpenPath(JSON_FILTER);
      if (!path) return;
      const summary = await commands.importData(path);
      onImported();
      const parts = [text(`新增并保留 ${summary.added} 条`, `Added and kept ${summary.added}`)];
      if (summary.trimmed > 0) {
        parts.push(text(`因容量上限裁剪 ${summary.trimmed} 条`, `Trimmed ${summary.trimmed} at the storage limit`));
      }
      if (summary.skipped > 0) {
        parts.push(text(`跳过 ${summary.skipped} 条（已存在或无效）`, `Skipped ${summary.skipped} (existing or invalid)`));
      }
      onToast(text(`导入完成：${parts.join("，")}`, `Import complete: ${parts.join(", ")}`));
    } catch (error) {
      onToast(text(`导入失败：${errorText(error, language)}`, `Import failed: ${errorText(error, language)}`));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy !== null}
        className="rounded-md border border-[var(--glass-border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        {busy === "export" ? text("导出中…", "Exporting…") : text("导出", "Export")}
      </button>
      <button
        type="button"
        onClick={() => void handleImport()}
        disabled={busy !== null}
        className="rounded-md border border-[var(--glass-border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        {busy === "import" ? text("导入中…", "Importing…") : text("导入", "Import")}
      </button>
    </div>
  );
}

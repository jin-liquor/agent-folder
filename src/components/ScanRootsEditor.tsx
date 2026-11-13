/**
 * 磁盘扫描根目录管理。
 *
 * 扫描只在这些目录下进行；留空则扫描功能无效，因此默认给出用户主目录。
 */
import { useState } from "react";
import type { Language } from "../lib/i18n";
import { pickFolder } from "../lib/system";

interface Props {
  roots: string[];
  onChange: (roots: string[]) => void;
  language: Language;
}

export default function ScanRootsEditor({ roots, onChange, language }: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    setBusy(true);
    try {
      const picked = await pickFolder();
      if (!picked) return;
      // 去重时不区分大小写，Windows 路径不敏感。
      const exists = roots.some((r) => r.toLowerCase() === picked.toLowerCase());
      if (exists) {
        setError(text("该目录已在列表中", "This directory is already in the list"));
        return;
      }
      onChange([...roots, picked]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = (target: string) => {
    setError(null);
    onChange(roots.filter((r) => r !== target));
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      {roots.length === 0 ? (
        <span className="text-[11px] text-[var(--text-secondary)] opacity-70">{text("未设置", "Not set")}</span>
      ) : (
        <div className="flex w-[190px] flex-col gap-1">
          {roots.map((root) => (
            <div
              key={root}
              className="flex items-center gap-1 rounded-md border border-[var(--glass-border)] px-2 py-1"
            >
              <span
                title={root}
                className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-primary)]"
              >
                {root}
              </span>
              <button
                type="button"
                aria-label={`${text("移除扫描目录", "Remove scan directory")} ${root}`}
                title={text("移除", "Remove")}
                onClick={() => remove(root)}
                className="shrink-0 rounded px-1 text-[11px] leading-none text-[var(--text-secondary)] transition hover:text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => void add()}
        disabled={busy}
        className="rounded-md border border-[var(--glass-border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        {busy ? text("选择中…", "Selecting…") : text("+ 添加目录", "+ Add directory")}
      </button>

      {error && (
        <span role="alert" className="text-[10px] text-red-500">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * 文件夹颜色标记的选择面板。
 *
 * 颜色只影响界面上的图标底色，不会改动磁盘上的文件夹。
 */

import type { Language } from "../lib/i18n";

/** 预置的标记色：与深色/浅色主题都有足够对比度。 */
export const FOLDER_COLORS = [
  { value: null, label: "默认", labelEn: "Default" },
  { value: "#f59e0b", label: "琥珀", labelEn: "Amber" },
  { value: "#ef4444", label: "红", labelEn: "Red" },
  { value: "#ec4899", label: "粉", labelEn: "Pink" },
  { value: "#8b5cf6", label: "紫", labelEn: "Purple" },
  { value: "#3b82f6", label: "蓝", labelEn: "Blue" },
  { value: "#10b981", label: "绿", labelEn: "Green" },
  { value: "#14b8a6", label: "青", labelEn: "Teal" },
  { value: "#64748b", label: "灰", labelEn: "Gray" },
] as const;

interface Props {
  /** 当前颜色，`null` 表示默认。 */
  current: string | null | undefined;
  onPick: (color: string | null) => void;
  onClose: () => void;
  language: Language;
}

export default function ColorPicker({ current, onPick, onClose, language }: Props) {
  const english = language === "en-US";
  return (
    <div
      className="absolute right-2 z-40 mt-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-solid)] p-2.5 shadow-2xl"
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-label={english ? "Choose label color" : "选择标记颜色"}
    >
      <div className="mb-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
        {english ? "Label color" : "标记颜色"}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {FOLDER_COLORS.map(({ value, label, labelEn }) => {
          const active = (current ?? null) === value;
          const colorLabel = english ? labelEn : label;
          return (
            <button
              key={label}
              type="button"
              title={colorLabel}
              aria-label={colorLabel}
              onClick={() => {
                onPick(value);
                onClose();
              }}
              className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${
                active
                  ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                  : "border-[var(--glass-border)] hover:border-[var(--text-secondary)]"
              }`}
              style={{ background: value ?? "transparent" }}
            >
              {value === null && (
                <span className="text-[9px] text-[var(--text-secondary)]">{english ? "None" : "无"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

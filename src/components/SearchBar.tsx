import { forwardRef } from "react";
import { ScanIcon, SearchIcon } from "./Icons";

interface Props {
  value: string;
  onChange: (v: string) => void;
  scanMode: boolean;
  onToggleScan: () => void;
  scanning: boolean;
}

const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { value, onChange, scanMode, onToggleScan, scanning },
  ref,
) {
  return (
    <div className="flex items-center gap-2 px-4 pt-1 pb-2">
      <div className="group flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] px-3 transition focus-within:border-[var(--accent)] focus-within:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]">
        <SearchIcon size={16} className="shrink-0 text-[var(--text-secondary)]" />
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="搜索文件夹名称或路径…"
          aria-label="搜索文件夹"
          spellCheck={false}
          className="h-full flex-1 bg-transparent text-[13.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
        />
        {scanning && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" title="正在扫描…" />
        )}
        {value ? (
          <button
            onClick={() => onChange("")}
            className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
          >
            清除
          </button>
        ) : (
          <span className="kbd">Ctrl K</span>
        )}
      </div>

      <button
        aria-pressed={scanMode}
        aria-label="磁盘扫描"
        title="在磁盘中扫描匹配的文件夹"
        onClick={onToggleScan}        className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[12px] transition ${
          scanMode
            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
            : "border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
        }`}
      >
        <ScanIcon size={15} />
        磁盘扫描
      </button>
    </div>
  );
});

export default SearchBar;

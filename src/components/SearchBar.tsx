import { forwardRef } from "react";
import { SearchIcon } from "./Icons";

interface Props {
  value: string;
  onChange: (v: string) => void;
  scanning: boolean;
}

const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { value, onChange, scanning },
  ref,
) {
  return (
    <div className="px-4 pt-1 pb-2">
      <div className="group flex h-10 items-center gap-2.5 rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] px-3 transition focus-within:border-[var(--accent)] focus-within:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]">
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
        {scanning && <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" title="正在扫描…" />}
        {value ? (
          <button
            aria-label="清空搜索"
            onClick={() => onChange("")}
            className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
          >
            清除
          </button>
        ) : (
          <span className="kbd">Ctrl K</span>
        )}
      </div>
    </div>
  );
});

export default SearchBar;

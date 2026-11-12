import { forwardRef, useEffect, useRef, useState } from "react";
import { SearchIcon } from "./Icons";

interface Props {
  value: string;
  onChange: (v: string) => void;
  scanning: boolean;
}

/**
 * 搜索输入框。
 *
 * 内部维护一份 `draft`：中文输入法拼写过程中只更新草稿、不触发查询，
 * 组合结束后再提交，避免拼音串引起的结果抖动。
 */
const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { value, onChange, scanning },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="px-3 pt-2 pb-2">
      <div className="gh-input group flex h-9 items-center gap-2 px-2.5">
        <SearchIcon size={15} className="shrink-0 text-[var(--text-secondary)]" />
        <input
          ref={ref}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (!composing.current) onChange(event.target.value);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            onChange(event.currentTarget.value);
          }}
          placeholder="搜索文件夹名称或路径…"
          aria-label="搜索文件夹"
          spellCheck={false}
          className="h-full flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
        />
        {scanning && (
          <span
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent)]"
            title="正在搜索…"
          />
        )}
        {draft ? (
          <button
            aria-label="清空搜索"
            onClick={() => {
              setDraft("");
              onChange("");
            }}
            className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--hover-subtle)] hover:text-[var(--text-primary)]"
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

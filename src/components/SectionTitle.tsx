/**
 * 列表分组标题。
 */
export default function SectionTitle({ text, extra }: { text: string; extra?: string }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-3 pb-1.5">
      <span className="text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
        {text}
      </span>
      {extra && (
        <span className="text-[10px] text-[var(--text-secondary)] opacity-60">{extra}</span>
      )}
    </div>
  );
}

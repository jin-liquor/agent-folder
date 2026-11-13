import { motion } from "framer-motion";
import type { Language } from "../lib/i18n";
import { FolderIcon, PlusIcon } from "./Icons";

export default function EmptyState({ onAdd, language }: { onAdd: () => void; language: Language }) {
  const english = language === "en-US";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-1 flex-col items-center justify-center gap-4 pb-10"
    >
      <div className="brand-mark flex h-14 w-14 items-center justify-center rounded-lg">
        <FolderIcon size={30} stroke="#fff" />
      </div>
      <div className="text-center">
        <div className="text-[15px] font-semibold text-[var(--text-primary)]">
          {english ? "Add your first folder" : "添加你的第一个文件夹"}
        </div>
        <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
          {english
            ? "Open it in your editor with one click"
            : "之后就能一键在编辑器中打开它"}
        </div>
      </div>
      <button
        onClick={onAdd}
        className="gh-btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition"
      >
        <PlusIcon size={14} />
        {english ? "Add folder" : "添加文件夹"}
      </button>
    </motion.div>
  );
}

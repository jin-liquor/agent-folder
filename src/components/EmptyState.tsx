import { motion } from "framer-motion";
import { FolderIcon, PlusIcon } from "./Icons";

export default function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-1 flex-col items-center justify-center gap-4 pb-10"
    >
      <div className="accent-gradient flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg">
        <FolderIcon size={30} stroke="#fff" />
      </div>
      <div className="text-center">
        <div className="text-[15px] font-semibold text-[var(--text-primary)]">
          添加你的第一个文件夹
        </div>
        <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
          之后就能一键在编辑器中打开它
        </div>
      </div>
      <button
        onClick={onAdd}
        className="accent-gradient flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-medium text-white shadow-md transition hover:brightness-110"
      >
        <PlusIcon size={14} />
        添加文件夹
      </button>
    </motion.div>
  );
}

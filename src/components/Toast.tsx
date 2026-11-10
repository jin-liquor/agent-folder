import { AnimatePresence, motion } from "framer-motion";

export default function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="pointer-events-none absolute bottom-5 left-1/2 z-50 w-[min(620px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-solid)] px-4 py-2 text-center text-[12px] leading-relaxed break-words text-[var(--text-primary)] shadow-xl"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

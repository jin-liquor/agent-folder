import { CheckIcon, WarningIcon } from "./Icons";
import type { StorageStatus } from "../lib/types";

export default function StorageNotice({ status }: { status: StorageStatus | null }) {
  if (!status?.warning) return null;

  return (
    <div
      role="status"
      className={`mx-3 mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
        status.readOnly
          ? "border-red-500/30 bg-red-500/8 text-red-500"
          : "border-amber-500/30 bg-amber-500/8 text-amber-600"
      }`}
    >
      {status.readOnly ? <WarningIcon size={14} /> : <CheckIcon size={14} />}
      <div className="min-w-0 break-words">
        <div>{status.warning}</div>
        {status.readOnly && <div className="mt-0.5 font-medium">当前不会覆盖原数据文件，请先处理该问题后再修改数据。</div>}
        {status.backupPath && (
          <div className="mt-0.5 opacity-80">备份位置：{status.backupPath}</div>
        )}
      </div>
    </div>
  );
}

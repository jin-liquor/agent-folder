/**
 * 打开方式动作条：VS Code / Codex / Claude / omp / opencode / 资源管理器。
 *
 * 默认只在选中行或悬停行显示，避免列表被图标噪声淹没；
 * 图标沿用各家品牌色，未检测到命令时置灰并给出 title 说明。
 *
 * 图标按固定优先级排列，保证同一个 CLI 在主窗口与浮窗里的相对位置一致。
 */
import {
  ClaudeIcon,
  CodexIcon,
  OmpIcon,
  OpencodeIcon,
  RevealIcon,
  VisualStudioCodeIcon,
} from "./Icons";
import type { CliAgentStatus } from "../lib/types";

interface Props {
  onVscode: () => void;
  onCodex: () => void;
  onClaude: () => void;
  onOmp: () => void;
  onOpencode: () => void;
  onReveal?: () => void;
  /** 各 CLI 是否可用；`null` 表示尚未探测，保持可点。 */
  available?: CliAgentStatus | null;
  /** 选中行常显，其余行靠 hover 显示。 */
  active?: boolean;
}

const BASE =
  "flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30";

/** 统一生成「未检测到」提示，避免六处文案不一致。 */
function disabledTitle(available: CliAgentStatus | null | undefined, key: keyof CliAgentStatus) {
  return available && !available[key] ? `未检测到 ${key} 命令` : null;
}

export default function OpenWithBar({
  onVscode,
  onCodex,
  onClaude,
  onOmp,
  onOpencode,
  onReveal,
  available,
  active = false,
}: Props) {
  const codexOff = disabledTitle(available, "codex");
  const claudeOff = disabledTitle(available, "claude");
  const ompOff = disabledTitle(available, "omp");
  const opencodeOff = disabledTitle(available, "opencode");

  return (
    <div
      className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
        active ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      }`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title="用 Visual Studio Code 打开"
        aria-label="用 Visual Studio Code 打开"
        onClick={onVscode}
        className={`${BASE} text-[#007ACC] hover:bg-[color-mix(in_srgb,#007ACC_12%,transparent)]`}
      >
        <VisualStudioCodeIcon size={13} />
      </button>
      <button
        type="button"
        title={codexOff ?? "在此目录启动 Codex"}
        aria-label="在此目录启动 Codex"
        onClick={onCodex}
        disabled={available ? !available.codex : false}
        className={`${BASE} text-[#10A37F] hover:bg-[color-mix(in_srgb,#10A37F_12%,transparent)]`}
      >
        <CodexIcon size={13} />
      </button>
      <button
        type="button"
        title={claudeOff ?? "在此目录启动 Claude Code"}
        aria-label="在此目录启动 Claude Code"
        onClick={onClaude}
        disabled={available ? !available.claude : false}
        className={`${BASE} text-[#D97757] hover:bg-[color-mix(in_srgb,#D97757_12%,transparent)]`}
      >
        <ClaudeIcon size={13} />
      </button>
      <button
        type="button"
        title={ompOff ?? "在此目录启动 omp"}
        aria-label="在此目录启动 omp"
        onClick={onOmp}
        disabled={available ? !available.omp : false}
        className={`${BASE} text-[#9b4dff] hover:bg-[color-mix(in_srgb,#9b4dff_12%,transparent)]`}
      >
        <OmpIcon size={13} />
      </button>
      <button
        type="button"
        title={opencodeOff ?? "在此目录启动 opencode"}
        aria-label="在此目录启动 opencode"
        onClick={onOpencode}
        disabled={available ? !available.opencode : false}
        className={`${BASE} text-[var(--text-primary)] hover:bg-[var(--hover-subtle)]`}
      >
        <OpencodeIcon size={13} />
      </button>
      {onReveal && (
        <button
          type="button"
          title="在资源管理器中显示"
          aria-label="在资源管理器中显示"
          onClick={onReveal}
          className={`${BASE} text-[var(--text-secondary)] hover:bg-[var(--hover-subtle)] hover:text-[var(--text-primary)]`}
        >
          <RevealIcon size={13} />
        </button>
      )}
    </div>
  );
}

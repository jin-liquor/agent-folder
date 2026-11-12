/**
 * 打开方式动作条：VS Code / Codex / Claude / 资源管理器。
 *
 * 默认只在选中行或悬停行显示，避免列表被图标噪声淹没；
 * 图标沿用各家品牌色，未检测到命令时置灰并给出 title 说明。
 */
import { ClaudeIcon, CodexIcon, RevealIcon, VisualStudioCodeIcon } from "./Icons";
import type { CliAgentStatus } from "../lib/types";

interface Props {
  onVscode: () => void;
  onCodex: () => void;
  onClaude: () => void;
  onReveal?: () => void;
  /** Codex / Claude 是否可用；`null` 表示尚未探测，保持可点。 */
  available?: CliAgentStatus | null;
  /** 选中行常显，其余行靠 hover 显示。 */
  active?: boolean;
}

const BASE =
  "flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30";

export default function OpenWithBar({
  onVscode,
  onCodex,
  onClaude,
  onReveal,
  available,
  active = false,
}: Props) {
  return (
    <div
      className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
        active ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      }`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title="用 Visual Studio Code 打开（Ctrl+Enter）"
        aria-label="用 Visual Studio Code 打开"
        onClick={onVscode}
        className={`${BASE} text-[#007ACC] hover:bg-[color-mix(in_srgb,#007ACC_12%,transparent)]`}
      >
        <VisualStudioCodeIcon size={13} />
      </button>
      <button
        type="button"
        title={
          available && !available.codex ? "未检测到 codex 命令" : "在此目录启动 Codex（Ctrl+1）"
        }
        aria-label="在此目录启动 Codex"
        onClick={onCodex}
        disabled={available ? !available.codex : false}
        className={`${BASE} text-[#10A37F] hover:bg-[color-mix(in_srgb,#10A37F_12%,transparent)]`}
      >
        <CodexIcon size={13} />
      </button>
      <button
        type="button"
        title={
          available && !available.claude
            ? "未检测到 claude 命令"
            : "在此目录启动 Claude Code（Ctrl+2）"
        }
        aria-label="在此目录启动 Claude Code"
        onClick={onClaude}
        disabled={available ? !available.claude : false}
        className={`${BASE} text-[#D97757] hover:bg-[color-mix(in_srgb,#D97757_12%,transparent)]`}
      >
        <ClaudeIcon size={13} />
      </button>
      {onReveal && (
        <button
          type="button"
          title="在资源管理器中显示（Ctrl+3）"
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

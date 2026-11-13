/**
 * CLI 启动模式预设编辑器。
 *
 * 每个 CLI 一个下拉栏：内置预设 + 用户自建预设。用户可以新增、
 * 改名、改参数、删除自建项；内置项只读，保证「默认模式」语义稳定。
 */
import { useRef, useState } from "react";
import type { Language } from "../lib/i18n";
import type { CliAgentId, CliPreset, CliPresets } from "../lib/types";
import { CheckIcon, PlusIcon, TrashIcon } from "./Icons";

interface Props {
  agent: CliAgentId;
  /** 内置预设（不可编辑）。 */
  builtins: CliPreset[];
  /** 用户自建预设（可编辑）。 */
  userPresets: CliPreset[];
  /** 当前选中的预设 id。 */
  selected: string;
  /** 选中某个预设。 */
  onSelect: (id: string) => void;
  /** 保存用户预设列表（增删改都走这里）。 */
  onChange: (presets: CliPreset[]) => void;
  /** 当前界面语言。 */
  language: Language;
  /** 该 CLI 的附加参数占位示例。 */
  placeholder: string;
}

/** 生成一个不会与现有 id 冲突的用户预设 id。 */
export function nextPresetId(existing: CliPreset[]): string {
  let n = existing.length + 1;
  const used = new Set(existing.map((p) => p.id));
  while (used.has(`user-${n}`)) n += 1;
  return `user-${n}`;
}

export default function CliPresetEditor({
  agent,
  builtins,
  userPresets,
  selected,
  onSelect,
  onChange,
  placeholder,
  language,
}: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
  const [editingId, setEditingId] = useState<string | null>(null);
  /**
   * 打开编辑前的预设快照。
   *
   * 「取消」要能把本次所有改动整体还原，包括改名与改参数，
   * 因此必须在进入编辑态时留一份副本。
   */
  const originalPresets = useRef<CliPreset[]>(userPresets);
  /** 当前编辑的是刚新建、尚未保存过的预设（取消时直接删掉）。 */
  const [isDraftNew, setIsDraftNew] = useState(false);

  const all = [...builtins, ...userPresets];
  const current = all.find((p) => p.id === selected) ?? builtins[0];
  const isBuiltin = current?.builtin ?? true;

  const addPreset = () => {
    const id = nextPresetId(userPresets);
    const preset: CliPreset = { id, name: text("新预设", "New preset"), args: "", builtin: false };
    originalPresets.current = userPresets;
    onChange([...userPresets, preset]);
    onSelect(id);
    setIsDraftNew(true);
    setEditingId(id);
  };

  const updatePreset = (id: string, patch: Partial<CliPreset>) => {
    onChange(userPresets.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePreset = (id: string) => {
    onChange(userPresets.filter((p) => p.id !== id));
    // 删掉的正是当前选中项时，回落到默认预设。
    if (selected === id) onSelect("default");
    if (editingId === id) setEditingId(null);
  };

  return (
    <div className="flex w-[268px] flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <select
          value={selected}
          aria-label={`${agent} ${text("启动模式", "launch mode")}`}
          onChange={(event) => {
            onSelect(event.target.value);
            setEditingId(null);
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
        >
          {all.map((preset) => (
            <option
              key={preset.id}
              value={preset.id}
              className="bg-[var(--glass-solid)] text-[var(--text-primary)]"
            >
              {preset.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          title={text("新增预设", "Add preset")}
          aria-label={`${text("为", "Add a preset for")} ${agent}`}
          onClick={addPreset}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--glass-border)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <PlusIcon size={13} />
        </button>
        <button
          type="button"
          title={isBuiltin ? text("内置预设不可删除", "Built-in presets cannot be deleted") : text("删除该预设", "Delete preset")}
          aria-label={text("删除预设", "Delete preset")}
          disabled={isBuiltin}
          onClick={() => current && removePreset(current.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--glass-border)] text-[var(--text-secondary)] transition hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-[var(--glass-border)] disabled:hover:text-[var(--text-secondary)]"
        >
          <TrashIcon size={13} />
        </button>
      </div>

      {editingId && (
        <div className="flex flex-col gap-1 rounded-md border border-[var(--accent)] p-1.5">
          <input
            value={userPresets.find((p) => p.id === editingId)?.name ?? ""}
            aria-label={text("预设名称", "Preset name")}
            maxLength={40}
            placeholder={text("预设名称", "Preset name")}
            onChange={(event) => updatePreset(editingId, { name: event.target.value })}
            className="h-7 rounded border border-[var(--glass-border)] bg-transparent px-1.5 text-[11px] text-[var(--text-primary)] outline-none"
          />
          <input
            value={userPresets.find((p) => p.id === editingId)?.args ?? ""}
            aria-label={text("预设参数", "Preset arguments")}
            maxLength={512}
            spellCheck={false}
            placeholder={placeholder}
            onChange={(event) => updatePreset(editingId, { args: event.target.value })}
            className="h-7 rounded border border-[var(--glass-border)] bg-transparent px-1.5 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
          />
          <button
            type="button"
            onClick={() => {
              setIsDraftNew(false);
              setEditingId(null);
            }}
            className="flex items-center justify-center gap-1 self-end rounded border border-[var(--glass-border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <CheckIcon size={10} />
            {text("完成", "Done")}
          </button>
          <button
            type="button"
            onClick={() => {
              // 取消 = 放弃本次编辑：删掉新建的空预设，或还原已改动的内容。
              if (isDraftNew) {
                removePreset(editingId);
              } else {
                onChange(originalPresets.current);
                setEditingId(null);
              }
            }}
            className="flex items-center justify-center gap-1 self-end rounded border border-[var(--glass-border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
          >
            {text("取消", "Cancel")}
          </button>
        </div>
      )}

      {!editingId && !isBuiltin && (
        <button
          type="button"
          onClick={() => {
            // 进入编辑前留快照，「取消」才能整体还原。
            originalPresets.current = userPresets;
            setIsDraftNew(false);
            setEditingId(current.id);
          }}
          className="self-start text-[10px] text-[var(--text-secondary)] underline-offset-2 transition hover:text-[var(--accent)] hover:underline"
        >
          {english ? `Edit “${current.name}” arguments` : `编辑「${current.name}」的参数`}
        </button>
      )}

      {!editingId && isBuiltin && current && (
        <span className="text-[10px] leading-relaxed text-[var(--text-secondary)]">
          {current.args
            ? `${text("内置参数", "Built-in arguments")}: ${current.args}`
            : text("内置参数：无（不附加任何参数）", "Built-in arguments: none")}
        </span>
      )}
    </div>
  );
}

/** 在预设集合里取出某个 CLI 的用户预设。 */
export function userPresetsOf(presets: CliPresets, agent: CliAgentId): CliPreset[] {
  return presets[agent] ?? [];
}

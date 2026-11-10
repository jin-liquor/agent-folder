/**
 * 开关控件。
 */
interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** 无障碍标签，缺省时由外层 `SettingRow` 的文案承担说明。 */
  label?: string;
}

export default function Switch({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "bg-[var(--accent)]"
          : "bg-[color-mix(in_srgb,var(--text-primary)_18%,transparent)]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[21px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

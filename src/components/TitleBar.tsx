/**
 * 无边框窗口的自定义标题栏：拖拽区域 + 应用标识 + 窗口按钮。
 */
import * as system from "../lib/system";
import { useAppStore } from "../stores/useAppStore";
import { t } from "../lib/i18n";
import appMark from "../assets/app-mark.png";
import { CloseIcon, MinimizeIcon, SettingsIcon } from "./Icons";
import TitleBarButton from "./ui/TitleBarButton";

export default function TitleBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { settings, saveSettings } = useAppStore();
  const language = settings.language;
  const switchLanguage = () => {
    void saveSettings({ language: language === "zh-CN" ? "en-US" : "zh-CN" }).catch(
      () => {},
    );
  };

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--glass-border)] bg-[var(--canvas-subtle)] pl-3 pr-1">
      <div
        className="flex h-full flex-1 items-center gap-2.5"
        onMouseDown={(event) => {
          if (event.button === 0) void system.startDragging();
        }}
      >
        <img
          src={appMark}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="brand-mark h-[18px] w-[18px] shrink-0 select-none"
        />
        <span className="text-[12.5px] font-semibold tracking-wide text-[var(--text-primary)]">
          Agent Folder
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={switchLanguage}
          title={language === "zh-CN" ? "Switch to English" : "切换到中文"}
          className="h-7 min-w-8 rounded-md px-1.5 text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] hover:text-[var(--accent)]"
        >
          {language === "zh-CN" ? "EN" : "中"}
        </button>
        <TitleBarButton label={t(language, "settings")} onClick={onOpenSettings}>
          <SettingsIcon size={15} />
        </TitleBarButton>
        <TitleBarButton label={t(language, "minimize")} onClick={() => void system.minimizeWindow()}>
          <MinimizeIcon size={15} />
        </TitleBarButton>
        <TitleBarButton label={language === "zh-CN" ? "关闭到系统托盘" : "Close to tray"} onClick={() => void system.closeWindow()} danger>
          <CloseIcon size={15} />
        </TitleBarButton>
      </div>
    </div>
  );
}

/**
 * 无边框窗口的自定义标题栏：拖拽区域 + 应用标识 + 窗口按钮。
 */
import * as system from "../lib/system";
import { CloseIcon, MinimizeIcon, SettingsIcon } from "./Icons";
import TitleBarButton from "./ui/TitleBarButton";

export default function TitleBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between pl-4 pr-1">
      <div
        className="flex h-full flex-1 items-center gap-2.5"
        onMouseDown={(event) => {
          if (event.button === 0) void system.startDragging();
        }}
      >
        <div className="accent-gradient flex h-5.5 w-5.5 items-center justify-center rounded-lg shadow-sm">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 8l-4 4 4 4" />
            <path d="M16 8l4 4-4 4" />
          </svg>
        </div>
        <span className="text-[12.5px] font-semibold tracking-wide text-[var(--text-primary)]">
          Agent Folder
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <TitleBarButton label="设置" onClick={onOpenSettings}>
          <SettingsIcon size={15} />
        </TitleBarButton>
        <TitleBarButton label="最小化到系统托盘" onClick={() => void system.hideWindow()}>
          <MinimizeIcon size={15} />
        </TitleBarButton>
        <TitleBarButton label="关闭到系统托盘" onClick={() => void system.closeWindow()} danger>
          <CloseIcon size={15} />
        </TitleBarButton>
      </div>
    </div>
  );
}

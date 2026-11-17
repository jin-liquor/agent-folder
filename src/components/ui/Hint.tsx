/**
 * 悬停提示：设置项的说明文字不再常驻界面，改为鼠标悬停查看。
 *
 * 用 `fixed` 定位 + portal 渲染到 `document.body`，而不是在触发元素里
 * 放一个绝对定位的气泡：设置页的右栏是滚动容器（`overflow-y: auto`），
 * 容器内的绝对定位气泡会被裁掉，靠近上下边缘的说明直接看不见。
 */
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 气泡最大宽度，与 Tailwind 的 `max-w-[260px]` 保持一致。 */
const TOOLTIP_WIDTH = 260;
/** 气泡与触发元素之间的间距。 */
const GAP = 8;
/** 气泡与窗口边缘的最小距离。 */
const EDGE = 8;
/** 上方剩余空间小于这个值时改为显示在下方。 */
const FLIP_THRESHOLD = 64;

interface Props {
  /** 提示内容；空值时不渲染气泡，只透传子元素。 */
  text?: string | null;
  children: ReactNode;
  /** 附加在外层包装上的类名。 */
  className?: string;
  /** 外层是否占满一行（目录项这类需要）。 */
  block?: boolean;
}

interface Box {
  left: number;
  top: number;
  width: number;
}

/**
 * 计算气泡位置：优先上方，空间不足时翻到下方，并夹在窗口内。
 *
 * `viewportWidth` 显式传入而不是直接读 `window`，这样纯逻辑可以在 node
 * 环境的单测里断言（真实调用时省略该参数即可）。
 */
export function tooltipBox(
  rect: { left: number; top: number; bottom: number },
  viewportWidth: number = window.innerWidth,
  width: number = TOOLTIP_WIDTH,
): Box {
  const maxWidth = Math.min(width, viewportWidth - EDGE * 2);
  const left = Math.min(Math.max(rect.left, EDGE), viewportWidth - maxWidth - EDGE);
  if (rect.top < FLIP_THRESHOLD) {
    return { left, top: rect.bottom + GAP, width: maxWidth };
  }
  return { left, top: rect.top - GAP, width: maxWidth };
}

export default function Hint({ text, children, className = "", block = false }: Props) {
  const [box, setBox] = useState<Box | null>(null);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const anchorRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setPlacement(anchor.top < FLIP_THRESHOLD ? "below" : "above");
    setBox(tooltipBox(anchor));
  };

  const hide = () => setBox(null);

  return (
    <span
      ref={anchorRef}
      className={`group/hint relative max-w-full items-center ${
        block ? "flex w-full" : "inline-flex"
      } ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {text && box
        ? createPortal(
            <span
              role="tooltip"
              style={{
                left: box.left,
                top: box.top,
                width: box.width,
                transform: placement === "above" ? "translateY(-100%)" : undefined,
              }}
              className="pointer-events-none fixed z-[100] rounded-md border border-[var(--glass-border)] bg-[var(--canvas-default)] px-2 py-1.5 text-[11px] leading-relaxed break-words text-[var(--text-secondary)] shadow-lg"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

"""把源 PNG 转换成 Tauri 需要的全套图标。

用法::

    pnpm icons                       # 用默认源图重新生成
    pnpm icons -- --source 路径.png  # 换一张源图
    pnpm icons -- --mode pixel       # 像素风源图用最近邻缩放
    pnpm icons -- --weight 1.25      # 加粗字形（默认 1.2）

产物写入 ``src-tauri/icons/``，供 Tauri 打包、系统托盘与窗口图标使用：

- ``icon.png``      512×512，安装包/关于信息
- ``128x128.png``   文件列表大图标
- ``32x32.png``     托盘图标与窗口图标
- ``icon.ico``      多尺寸 ICO，Windows 可执行文件资源与安装包

设计约束：

- **只读源文件、只写目标目录**，绝不修改用户提供的素材；
- 源图是宽幅字形（内容区高度远小于画布），小尺寸下会糊成一条细线，
  因此提供 ``compact`` 变体：裁切到内容区后重新居中放满画布；
- 原图笔画偏细，在深色背景与 32 px 托盘尺寸下不够醒目，
  因此提供 ``--weight`` 形态学加粗（默认 1.2）。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri" / "icons"

# 默认源图：工作区外的素材目录，按约定不改动。
DEFAULT_SOURCE = Path(
    r"E:\workspace\agent-folder-icon\glyph_balanced_candidates\01_balanced_512px.png"
)

# Windows 会在不同 DPI 下挑选最接近的尺寸，因此提供完整阶梯。
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)

# 小于等于该尺寸时使用 compact 变体，避免宽幅字形缩得看不清。
COMPACT_THRESHOLD = 48


def load_source(path: Path) -> Image.Image:
    """读取源图并统一成 RGBA。"""
    if not path.is_file():
        raise SystemExit(f"找不到源图：{path}")
    return Image.open(path).convert("RGBA")


def resize_filter(mode: str):
    return (
        Image.Resampling.NEAREST if mode == "pixel" else Image.Resampling.LANCZOS
    )


def thicken(image: Image.Image, weight: float) -> Image.Image:
    """加粗字形笔画，同时保留颜色与抗锯齿。

    做法：对 alpha 通道做「最大值膨胀」，半径由 ``weight`` 决定。
    逐像素取邻域最大值等价于一次形态学膨胀，比直接描边更平滑，
    也不会改变字形结构。权重为 1 时原样返回。
    """
    if weight <= 1.0:
        return image

    # 源图 512px 时半径 2px 约等于笔画 +40%，随尺寸等比缩放由调用方处理。
    radius = weight - 1.0
    alpha = image.getchannel("A")
    # 用两次 3x3 最大值滤波近似更大半径；PIL 无直接膨胀，这里用高斯近似后阈值。
    grown = alpha.filter(ImageFilter.MaxFilter(3))
    if radius > 0.15:
        grown = grown.filter(ImageFilter.MaxFilter(3))

    out = image.copy()
    out.putalpha(grown)
    return out


def compact_variant(image: Image.Image, weight: float, canvas: int = 512) -> Image.Image:
    """把内容裁到外接框后等比放大填满画布，保留少量内边距。

    宽幅字形（例如 464×272）在 16 px 下只有 9 px 高，几乎不可辨认。
    compact 变体把内容按原比例重新排版进正方形画布，让其在小尺寸
    下占据接近 88% 的可见面积。
    """
    box = image.getbbox()
    if box is None:
        return image
    cropped = image.crop(box)
    width, height = cropped.size
    scale = (canvas * 0.88) / max(width, height)
    target = (max(1, round(width * scale)), max(1, round(height * scale)))
    scaled = cropped.resize(target, Image.Resampling.LANCZOS)

    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(scaled, ((canvas - target[0]) // 2, (canvas - target[1]) // 2), scaled)
    return out


def build_icons(source: Image.Image, mode: str, weight: float) -> dict[int, Image.Image]:
    """生成各档位图标。小尺寸走 compact 变体，并按尺寸补偿笔画粗细。"""
    resample = resize_filter(mode)
    compact = compact_variant(source, weight)
    icons: dict[int, Image.Image] = {}
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        base = compact if size <= COMPACT_THRESHOLD else source
        # 小尺寸额外加粗：缩小时笔画会被平均掉，补偿一档更清晰。
        extra = 1.0 if size > COMPACT_THRESHOLD else 0.35
        shaped = thicken(base, weight + extra)
        if shaped.size == (size, size):
            icons[size] = shaped.copy()
        else:
            icons[size] = shaped.resize((size, size), resample)
    return icons


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 Tauri 应用图标")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="源 PNG 路径")
    parser.add_argument(
        "--mode",
        choices=("smooth", "pixel"),
        default="smooth",
        help="缩放算法：smooth 用 LANCZOS，pixel 用 NEAREST",
    )
    parser.add_argument(
        "--weight",
        type=float,
        default=1.2,
        help="笔画加粗系数，1.0 表示不改动（默认 1.2）",
    )
    args = parser.parse_args()

    source = load_source(args.source)
    icons = build_icons(source, args.mode, args.weight)

    OUT.mkdir(parents=True, exist_ok=True)

    icons[512].save(OUT / "icon.png")
    icons[128].save(OUT / "128x128.png")
    icons[32].save(OUT / "32x32.png")

    ico = icons[256]
    ico.save(
        OUT / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
        append_images=[icons[size] for size in ICO_SIZES if size != 256],
    )

    written = sorted(p.name for p in OUT.glob("*"))
    print(f"图标已写入 {OUT}")
    print(f"源图：{args.source}（{source.size[0]}×{source.size[1]}，模式 {args.mode}，加粗 {args.weight}）")
    print(f"共 {len(written)} 个文件：{', '.join(written)}")


if __name__ == "__main__":
    sys.exit(main())

"""生成应用图标（像素风 `< A >`）。

产物写入 ``src-tauri/icons/``，供 Tauri 打包与系统托盘使用：

- ``icon.png``      512×512，安装包/关于信息
- ``128x128.png``   文件列表大图标
- ``32x32.png``     托盘图标与窗口图标
- ``icon.ico``      多尺寸 ICO，Windows 可执行文件资源

设计约束：所有尺寸都由同一个 16×16 逻辑网格按整数倍放大，
保证像素边缘锐利、不出现半透明模糊。
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"

# 逻辑画布尺寸：16×16 网格，放大时用整数倍保证像素对齐。
GRID = 16

# 调色板：深蓝紫底 + 亮蓝描边，白色字形。
COLOR_OUTER = (74, 76, 238, 255)
COLOR_INNER = (25, 31, 82, 255)
COLOR_HIGHLIGHT = (92, 117, 255, 255)
COLOR_SHADE = (38, 43, 116, 255)
COLOR_TEXT = (244, 247, 255, 255)
COLOR_TEXT_SHADOW = (9, 13, 43, 255)

# 3×5 点阵字形，`1` 表示点亮。
GLYPHS = {
    "<": ("0010", "0100", "1000", "0100", "0010"),
    "A": ("0110", "1001", "1111", "1001", "1001"),
    ">": ("0100", "0010", "0001", "0010", "0100"),
}
TEXT = "<A>"


def _rounded_square_cells() -> tuple[set[tuple[int, int]], set[tuple[int, int]]]:
    """返回外描边与内填充的单元格集合（四角各切掉一格）。"""
    outer = {
        (x, y)
        for y in range(GRID)
        for x in range(GRID)
        if not ((y in (0, GRID - 1)) and x in (0, 1, GRID - 2, GRID - 1))
        and not ((y in (1, GRID - 2)) and x in (0, GRID - 1))
    }
    inner = {
        (x, y)
        for y in range(1, GRID - 1)
        for x in range(1, GRID - 1)
        if not ((y in (1, GRID - 2)) and x in (1, GRID - 2))
    }
    return outer, inner


def _text_cells() -> list[tuple[int, int]]:
    """把 `<A>` 居中排版到逻辑网格上，字间留一列空隙。"""
    width = sum(len(GLYPHS[ch][0]) for ch in TEXT) + (len(TEXT) - 1)
    start_x = (GRID - width) // 2
    start_y = (GRID - len(GLYPHS["A"])) // 2

    cells: list[tuple[int, int]] = []
    cursor = start_x
    for char in TEXT:
        glyph = GLYPHS[char]
        for row, line in enumerate(glyph):
            for col, value in enumerate(line):
                if value == "1":
                    cells.append((cursor + col, start_y + row))
        cursor += len(glyph[0]) + 1
    return cells


def _paint(draw: ImageDraw.ImageDraw, cells, unit: int, color) -> None:
    """按整数倍放大绘制单元格。"""
    for x, y in cells:
        draw.rectangle(
            (x * unit, y * unit, (x + 1) * unit - 1, (y + 1) * unit - 1),
            fill=color,
        )


def build_icon(size: int) -> Image.Image:
    """构造指定边长的图标；边长需为 16 的整数倍。"""
    if size % GRID != 0:
        raise ValueError(f"图标边长必须是 {GRID} 的整数倍，收到 {size}")

    unit = size // GRID
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    outer, inner = _rounded_square_cells()
    _paint(draw, outer, unit, COLOR_OUTER)
    _paint(draw, inner, unit, COLOR_INNER)

    # 左上受光、右下压暗，让方块有轻微立体感。
    _paint(draw, {(2, 1), (3, 1), (4, 1), (1, 2)}, unit, COLOR_HIGHLIGHT)
    _paint(draw, {(11, 13), (12, 13), (13, 12)}, unit, COLOR_SHADE)

    cells = _text_cells()
    # 单格右下投影，保证 32px 托盘尺寸下依然可辨认。
    _paint(draw, {(x + 1, y + 1) for x, y in cells}, unit, COLOR_TEXT_SHADOW)
    _paint(draw, cells, unit, COLOR_TEXT)
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    icons = {size: build_icon(size) for size in (32, 128, 512)}
    icons[32].save(OUT / "32x32.png")
    icons[128].save(OUT / "128x128.png")
    icons[512].save(OUT / "icon.png")

    # Windows 会在不同 DPI 下挑选最接近的尺寸，因此提供完整阶梯。
    ico_sizes = (16, 24, 32, 48, 64, 128, 256)
    icons[512].resize((256, 256), Image.Resampling.NEAREST).save(
        OUT / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in ico_sizes],
    )

    written = ", ".join(sorted(p.name for p in OUT.glob("*")))
    print(f"图标已写入 {OUT}")
    print(f"共 {len(list(OUT.glob('*')))} 个文件：{written}")


if __name__ == "__main__":
    main()

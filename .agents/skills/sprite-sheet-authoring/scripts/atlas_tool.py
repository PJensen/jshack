#!/usr/bin/env python3
"""Deterministic transparent-atlas inspection and cell operations."""

import argparse
import math
from pathlib import Path
from PIL import Image, ImageFilter


def rgba(path):
    return Image.open(path).convert("RGBA")


def inspect(args):
    image = rgba(args.atlas)
    if image.width % args.cell_width or image.height % args.cell_height:
        raise SystemExit("atlas dimensions are not divisible by the requested cell size")
    alpha = image.getchannel("A").load()
    cols, rows = image.width // args.cell_width, image.height // args.cell_height
    print(f"atlas={args.atlas} size={image.width}x{image.height} cells={cols}x{rows}")
    for row in range(rows):
        occupied = []
        for col in range(cols):
            count = sum(
                alpha[x, y] >= args.alpha_threshold
                for y in range(row * args.cell_height, (row + 1) * args.cell_height)
                for x in range(col * args.cell_width, (col + 1) * args.cell_width)
            )
            if count:
                occupied.append(f"{col},{row}:{count}")
        print(f"row {row}: " + (" ".join(occupied) if occupied else "empty"))


def insert(args):
    atlas, sprite = rgba(args.atlas), rgba(args.sprite)
    if args.fit:
        sprite.thumbnail((args.fit, args.fit), Image.Resampling.LANCZOS)
    if args.x < 0 or args.y < 0 or args.x + sprite.width > atlas.width or args.y + sprite.height > atlas.height:
        raise SystemExit("sprite does not fit inside atlas at the requested position")
    atlas.alpha_composite(sprite, (args.x, args.y))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output, format="PNG", optimize=True)
    print(f"wrote {args.output} ({atlas.width}x{atlas.height}, RGBA PNG)")


def normal(args):
    sprite = rgba(args.sprite)
    alpha = sprite.getchannel("A").filter(ImageFilter.GaussianBlur(1.25))
    value = sprite.convert("L")
    height = Image.new("L", sprite.size, 0)
    ap, vp, hp = alpha.load(), value.load(), height.load()
    for y in range(sprite.height):
        for x in range(sprite.width):
            a = ap[x, y] / 255.0
            hp[x, y] = round(255 * (0.72 * a + 0.28 * a * vp[x, y] / 255.0))
    hp = height.load()
    output, op = Image.new("RGB", sprite.size, (128, 128, 255)), None
    op = output.load()
    for y in range(sprite.height):
        for x in range(sprite.width):
            dx = (hp[min(sprite.width - 1, x + 1), y] - hp[max(0, x - 1), y]) / 255.0
            dy = (hp[x, min(sprite.height - 1, y + 1)] - hp[x, max(0, y - 1)]) / 255.0
            nx, ny, nz = -dx * args.strength, -dy * args.strength, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            op[x, y] = (round((nx / length * .5 + .5) * 255), round((ny / length * .5 + .5) * 255), round((nz / length * .5 + .5) * 255))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output, format="PNG", optimize=True)
    print(f"wrote {args.output} ({output.width}x{output.height}, RGB normal map)")


def amplify(args):
    image = Image.open(args.atlas).convert("RGB")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b = pixels[x, y]
            nx = (r - 128.0) / 127.5
            ny = (g - 128.0) / 127.5
            nz = (b - 127.5) / 127.5
            nx *= args.strength
            ny *= args.strength
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            pixels[x, y] = (
                round((nx / length * 0.5 + 0.5) * 255),
                round((ny / length * 0.5 + 0.5) * 255),
                round((nz / length * 0.5 + 0.5) * 255),
            )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, format="PNG", optimize=True)
    print(f"wrote {args.output} ({image.width}x{image.height}, amplified RGB normal atlas)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("inspect"); p.add_argument("--atlas", type=Path, required=True); p.add_argument("--cell-width", type=int, required=True); p.add_argument("--cell-height", type=int, required=True); p.add_argument("--alpha-threshold", type=int, default=8); p.set_defaults(run=inspect)
    p = sub.add_parser("insert"); p.add_argument("--atlas", type=Path, required=True); p.add_argument("--sprite", type=Path, required=True); p.add_argument("--output", type=Path, required=True); p.add_argument("--x", type=int, required=True); p.add_argument("--y", type=int, required=True); p.add_argument("--fit", type=int, default=0); p.set_defaults(run=insert)
    p = sub.add_parser("normal"); p.add_argument("--sprite", type=Path, required=True); p.add_argument("--output", type=Path, required=True); p.add_argument("--strength", type=float, default=3.5); p.set_defaults(run=normal)
    p = sub.add_parser("amplify"); p.add_argument("--atlas", type=Path, required=True); p.add_argument("--output", type=Path, required=True); p.add_argument("--strength", type=float, default=1.6); p.set_defaults(run=amplify)
    args = parser.parse_args(); args.run(args)


if __name__ == "__main__":
    main()

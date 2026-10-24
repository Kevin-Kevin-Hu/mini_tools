#!/usr/bin/env python3
"""超大文件守卫：任何源码文件超过 LIMIT 行即报错（exit 1）。

直接落实 AGENTS.md 的「单文件 ≤ 500 行」硬约束，CI 中执行。
本地用法：python scripts/check_file_size.py [--limit 500]
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_LIMIT = 500
EXTS = {".js", ".jsx", ".ts", ".tsx", ".py", ".css"}
SKIP_DIRS = {
    "node_modules",
    "static",
    "dist",
    "build",
    "venv",
    "__pycache__",
    ".git",
    ".workbuddy",
}

# 已知超限的存量文件（待拆分）。拆分后请从本列表移除，恢复 500 行硬约束。
# 新文件一律须 ≤ DEFAULT_LIMIT，不要往这里加名字来规避检查。
GRANDFATHERED = {
    "frontend/src/tools/EqualSubstitution.jsx",  # 628 行：渲染/状态待拆分
}


def main() -> int:
    ap = argparse.ArgumentParser(description="检查源码文件是否超过行数上限")
    ap.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    ap.add_argument("--root", default=ROOT)
    args = ap.parse_args()

    offenders = []
    grandfathered = []
    for dirpath, dirnames, filenames in os.walk(args.root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            if f.endswith(".genie"):
                continue
            ext = os.path.splitext(f)[1]
            if ext not in EXTS:
                continue
            p = os.path.join(dirpath, f)
            rel = os.path.relpath(p, args.root)
            try:
                with open(p, encoding="utf-8") as fh:
                    n = sum(1 for _ in fh)
            except (OSError, UnicodeDecodeError):
                continue
            if n > args.limit:
                if rel in GRANDFATHERED:
                    grandfathered.append((rel, n))
                else:
                    offenders.append((rel, n))

    if offenders:
        print(f"❌ 以下文件超过 {args.limit} 行（应按 AGENTS.md 拆分）：")
        for rel, n in sorted(offenders, key=lambda x: -x[1]):
            print(f"  {n:>5}  {rel}")
        if grandfathered:
            print("（以下为已知存量超限、暂豁免，待拆分后移除白名单）:")
            for rel, n in grandfathered:
                print(f"  {n:>5}  {rel}  [grandfathered]")
        return 1

    if grandfathered:
        print(f"✅ 所有新增/其余源码文件均 ≤ {args.limit} 行")
        print("（以下为已知存量超限、暂豁免，待拆分后移除白名单）:")
        for rel, n in grandfathered:
            print(f"  {n:>5}  {rel}  [grandfathered]")
        return 0

    print(f"✅ 所有源码文件均 ≤ {args.limit} 行")
    return 0


if __name__ == "__main__":
    sys.exit(main())

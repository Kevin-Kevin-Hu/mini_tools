import argparse
import os
import re
import sys

# 微信内置自闭合/void 标签（不需闭合）
VOID = {"input","image","icon","progress","switch","slider","audio","video","camera",
        "live-player","live-pusher","open-data","ad","web-view","canvas","import","include","wxs","slot"}

def check(path):
    text = open(path, encoding="utf-8").read()
    # 去掉注释
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    # 归一化：把跨行的标签合并成一行（<input\n ... />）
    text = re.sub(r"<[^<>]*?>", lambda m: re.sub(r"\s+", " ", m.group(0)), text)
    errs, stack = [], []
    for m in re.finditer(r'<(/?)([a-zA-Z][\w-]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*?)(/?)>', text):
        closing, tag, selfc = m.group(1), m.group(2), m.group(4)
        if tag in VOID or selfc == "/":
            continue
        if closing:
            if not stack:
                errs.append(f"多余的 </{tag}>")
            elif stack[-1][0] != tag:
                errs.append(f"</{tag}> 与未闭合的 <{stack[-1][0]}> 不匹配")
                for i in range(len(stack)-1, -1, -1):
                    if stack[i][0] == tag:
                        del stack[i:]
                        break
            else:
                stack.pop()
        else:
            stack.append((tag, m.start()))
    for t, p in stack:
        errs.append(f"<{t}> 未闭合")
    return errs

ap = argparse.ArgumentParser(description="检查小程序 WXML 标签是否正确闭合")
ap.add_argument("--root", default="frontend/miniprogram", help="小程序源码根目录")
args = ap.parse_args()

files = []
for dirpath, dirnames, filenames in os.walk(args.root):
    dirnames[:] = [d for d in dirnames if d not in {"node_modules", "miniprogram_npm", "vendor", "dist"}]
    for fn in filenames:
        if fn.endswith(".wxml"):
            files.append(os.path.join(dirpath, fn))

bad = 0
for f in sorted(files):
    e = check(f)
    if e:
        bad += 1
        print(f"❌ {os.path.relpath(f, args.root)}")
        for x in e[:6]:
            print("   ", x)
    else:
        print(f"✅ {f}")
print("\n结果:", "全部通过 ✅" if bad == 0 else f"{bad} 个文件有问题 ❌")
sys.exit(1 if bad else 0)

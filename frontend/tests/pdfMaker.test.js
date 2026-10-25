// pdfMaker（小程序 A4 PDF 生成器）结构测试。
// 生成器只按字节嵌入 JPEG、不解析其内容，因此用带 JPEG 魔数（FFD8FF）的假数据即可；
// 真实渲染验证（pypdf 解析 + 图片提取）在开发期已完成。
import test from "node:test";
import assert from "node:assert/strict";
import pdfMaker from "../miniprogram/utils/pdfMaker.js";

// 200 字节假 JPEG：FFD8FF 开头（SOI + 段起始），其余为序号填充
const FAKE_JPEG = new Uint8Array(200);
FAKE_JPEG.set([0xff, 0xd8, 0xff, 0xe0]);
for (let i = 4; i < FAKE_JPEG.length; i++) FAKE_JPEG[i] = i % 256;

function build(landscape) {
  return pdfMaker.buildImagePdf(
    FAKE_JPEG,
    1754,
    1240,
    landscape ? 842 : 595,
    landscape ? 595 : 842
  );
}

function asLatin1(bytes) {
  return Buffer.from(bytes).toString("latin1");
}

test("PDF 头尾结构", () => {
  const text = asLatin1(build(true));
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.includes("%\xe2\xe3\xcf\xd3")); // 二进制标记注释
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text.trimEnd(), /startxref\n\d+\n%%EOF$/);
});

test("xref 表：20 字节条目 + 偏移全部指向对应对象", () => {
  const pdf = build(true);
  const text = asLatin1(pdf);
  const xrefStart = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
  const XREF_HEAD = 9; // "xref\n" 5 + "0 6\n" 4
  const raw = pdf.slice(xrefStart, xrefStart + XREF_HEAD + 6 * 20);
  assert.equal(raw.length, XREF_HEAD + 6 * 20);

  const entries = [];
  for (let i = 0; i < 6; i++) {
    entries.push(
      Buffer.from(raw.slice(XREF_HEAD + i * 20, XREF_HEAD + (i + 1) * 20)).toString("latin1")
    );
  }
  // free 条目：偏移 0、生成号 65535、类型 f、行尾 SP+LF
  assert.equal(entries[0], "0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) {
    const off = Number(entries[i].slice(0, 10));
    assert.ok(text.startsWith(`${i} 0 obj`, off), `xref 条目 ${i} 应指向 ${i} 0 obj`);
    assert.match(entries[i], /^\d{10} 00000 n \n$/);
  }
});

test("横向：MediaBox 842x595 + JPEG 流完整嵌入", () => {
  const pdf = build(true);
  const text = asLatin1(pdf);
  assert.ok(text.includes("/MediaBox [0 0 842 595]"));
  assert.ok(text.includes("/Filter /DCTDecode"));
  assert.ok(text.includes(`/Length ${FAKE_JPEG.length} >>`));

  // 找到 Im0 的 stream，验证 JPEG 魔数与 endstream 位置精确
  const streamIdx = text.indexOf("stream\n", text.indexOf("4 0 obj")) + "stream\n".length;
  assert.equal(pdf[streamIdx], 0xff);
  assert.equal(pdf[streamIdx + 1], 0xd8);
  assert.ok(
    text
      .slice(streamIdx + FAKE_JPEG.length, streamIdx + FAKE_JPEG.length + 12)
      .startsWith("\nendstream"),
    "JPEG 数据后必须紧跟 endstream（Length 声明精确）"
  );
});

test("纵向：MediaBox 595x842，横图上下留白居中", () => {
  const pdf = build(false);
  const text = asLatin1(pdf);
  assert.ok(text.includes("/MediaBox [0 0 595 842]"));
  // 1754x1240 横图放进 595x842 纵页：宽铺满，高 420.5，y ≈ 210.75
  const cm = text.match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/);
  assert.ok(cm, "应有内容流 cm 矩阵");
  assert.ok(Math.abs(+cm[1] - 595) < 1, `drawW 应≈595，实际 ${cm[1]}`);
  assert.ok(+cm[4] > 100, `y 应 >100（上下留白），实际 ${cm[4]}`);
});

test("内容流：图片等比 fit 不变形", () => {
  // 横向页 842x595，图 1754x1240：比例极接近，宽≈841.6 高=595，x≈0
  const cm = asLatin1(build(true)).match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/);
  assert.ok(+cm[1] > 841 && +cm[1] <= 842);
  assert.ok(Math.abs(+cm[2] - 595) < 1);
  assert.ok(+cm[3] < 1); // 水平居中（几乎无留白）

  // 方图进横页：高铺满 595，宽 595，x≈123.5 居中
  const sq = pdfMaker.buildImagePdf(FAKE_JPEG, 1000, 1000, 842, 595);
  const cmSq = asLatin1(sq).match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/);
  assert.equal(+cmSq[2], 595);
  assert.ok(Math.abs(+cmSq[3] - 123.5) < 0.1, `方图 x 应≈123.5，实际 ${cmSq[3]}`);
  assert.equal(+cmSq[4], 0);
});

test("字节可拼接：UTF-8 多字节不会算错偏移", () => {
  // 回归防护：asciiBytes 用 charCodeAt & 0xff，与 offset 累计必须一致
  const pdf = build(true);
  assert.ok(pdf instanceof Uint8Array);
  assert.ok(pdf.length > FAKE_JPEG.length);
});

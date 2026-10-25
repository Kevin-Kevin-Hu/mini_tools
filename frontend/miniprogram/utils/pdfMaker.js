// 每日计划 · 最小 PDF 生成器：把一张 JPEG 嵌进单页 PDF（小程序「直接打印」用）
//
// 为什么不用 jsPDF 等库：小程序有包体积限制，而我们的需求只是「一张图一页」，
// 手写 PDF 骨架反而更好维护。结构（PDF 1.4 子集）：
//   1 0 obj  Catalog（文档根）
//   2 0 obj  Pages（页树，1 页）
//   3 0 obj  Page（MediaBox 决定 A4 横/纵向；引用图片 XObject + 内容流）
//   4 0 obj  Image XObject（/Filter /DCTDecode —— JPEG 数据可原样嵌入）
//   5 0 obj  内容流（q ... cm /Im0 Do Q，图片按页面等比居中铺放）
//   xref + trailer + startxref
//
// 用法：
//   const jpegBytes = new Uint8Array(wx.base64ToArrayBuffer(base64));
//   const pdf = pdfMaker.buildImagePdf(jpegBytes, imgW, imgH, 842, 595); // A4 横向(pt)
//   fs.writeFile({ filePath, data: pdf.buffer, encoding: "binary", ... });

// ---------- 字节拼接（小程序没有 Buffer.concat） ----------
function concatBytes(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// ASCII 字符串 → Uint8Array（PDF 骨架全是 ASCII；二进制只来自 JPEG 流）
function asciiBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * 生成单页 PDF。
 * @param {Uint8Array} imageBytes JPEG 二进制
 * @param {number} imgW 图片像素宽
 * @param {number} imgH 图片像素高
 * @param {number} pageWpt 页宽(pt)：A4 横向 842 / 纵向 595
 * @param {number} pageHpt 页高(pt)：A4 横向 595 / 纵向 842
 * @returns {Uint8Array} PDF 文件字节
 */
function buildImagePdf(imageBytes, imgW, imgH, pageWpt, pageHpt) {
  // 图片在页面上等比居中（不拉伸变形）：scale 取宽高比的较小值
  const scale = Math.min(pageWpt / imgW, pageHpt / imgH);
  const drawW = +(imgW * scale).toFixed(2);
  const drawH = +(imgH * scale).toFixed(2);
  const x = +((pageWpt - drawW) / 2).toFixed(2);
  const y = +((pageHpt - drawH) / 2).toFixed(2);
  const content = `q ${drawW} 0 0 ${drawH} ${x} ${y} cm /Im0 Do Q`;

  const chunks = [];
  let offset = 0;
  const push = (u8) => {
    chunks.push(u8);
    offset += u8.length;
  };
  const offsets = {}; // 对象编号 → 字节偏移（xref 表要用）

  // 头部。第二行是标准「二进制标记」注释：告诉各类工具后面有二进制流，别当文本转码
  push(asciiBytes("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"));

  offsets[1] = offset;
  push(asciiBytes("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));

  offsets[2] = offset;
  push(asciiBytes("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"));

  offsets[3] = offset;
  push(
    asciiBytes(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
        `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
    )
  );

  offsets[4] = offset;
  push(
    asciiBytes(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${imageBytes.length} >>\nstream\n`
    )
  );
  push(imageBytes);
  push(asciiBytes("\nendstream\nendobj\n"));

  offsets[5] = offset;
  push(asciiBytes(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`));

  const xrefStart = offset;
  // xref 子条目必须恰好 20 字节：10 位偏移 + 空格 + 5 位生成号 + 空格 + n/f + 2 字节行尾
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  push(asciiBytes(xref));
  push(asciiBytes(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`));

  return concatBytes(chunks);
}

module.exports = { buildImagePdf };

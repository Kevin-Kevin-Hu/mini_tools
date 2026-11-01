// 每日计划 / 计算练习题 · 最小 PDF 生成器：把一张或多张 JPEG 嵌进 PDF（小程序「直接打印」用）
//
// 为什么不用 jsPDF 等库：小程序有包体积限制，而我们的需求只是「一张图一页」，
// 手写 PDF 骨架反而更好维护。结构（PDF 1.4 子集）：
//   1 0 obj  Catalog（文档根）
//   2 0 obj  Pages（页树：Kids 列出每页 /Count 为页数）
//   3+3k 0 obj  Page k（MediaBox 决定 A4 横/纵向；引用图片 XObject + 内容流）
//   4+3k 0 obj  Image XObject k（/Filter /DCTDecode —— JPEG 数据可原样嵌入）
//   5+3k 0 obj  内容流 k（q ... cm /Imk Do Q，图片按页面等比居中铺放）
//   xref + trailer + startxref
//
// 用法（单页，与旧版等价）：
//   const pdf = pdfMaker.buildImagePdf(jpegBytes, imgW, imgH, 842, 595); // A4 横向(pt)
// 多页（一次导出 N 张纸）：
//   const pdf = pdfMaker.buildImagePdf([jpeg0, jpeg1, ...], imgW, imgH, 595, 842); // A4 纵向(pt)

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
 * 生成 PDF（单页或多页）。
 * @param {Uint8Array|Uint8Array[]} imageBytes 单张 JPEG，或多张 JPEG 数组（每页一张）
 * @param {number} imgW 图片像素宽
 * @param {number} imgH 图片像素高
 * @param {number} pageWpt 页宽(pt)：A4 横向 842 / 纵向 595
 * @param {number} pageHpt 页高(pt)：A4 横向 595 / 纵向 842
 * @returns {Uint8Array} PDF 文件字节
 */
function buildImagePdf(imageBytes, imgW, imgH, pageWpt, pageHpt) {
  const images = Array.isArray(imageBytes) ? imageBytes : [imageBytes];
  if (!images.length) throw new Error("至少需要一张图片");

  // 图片在页面上等比居中（不拉伸变形）：scale 取宽高比的较小值
  const scale = Math.min(pageWpt / imgW, pageHpt / imgH);
  const drawW = +(imgW * scale).toFixed(2);
  const drawH = +(imgH * scale).toFixed(2);
  const x = +((pageWpt - drawW) / 2).toFixed(2);
  const y = +((pageHpt - drawH) / 2).toFixed(2);

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

  // 页树：Kids 列出所有页面对象，Count = 页数（单页时 Kids=[3 0 R]，与旧版一致）
  offsets[2] = offset;
  const kids = images.map((_, k) => `${3 + 3 * k} 0 R`).join(" ");
  push(asciiBytes(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>\nendobj\n`));

  images.forEach((img, k) => {
    const pageObj = 3 + 3 * k;
    const imgObj = 4 + 3 * k;
    const contentObj = 5 + 3 * k;
    const content = `q ${drawW} 0 0 ${drawH} ${x} ${y} cm /Im${k} Do Q`;

    offsets[pageObj] = offset;
    push(
      asciiBytes(
        `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
          `/Resources << /XObject << /Im${k} ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`
      )
    );

    offsets[imgObj] = offset;
    push(
      asciiBytes(
        `${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
          `/Length ${img.length} >>\nstream\n`
      )
    );
    push(img);
    push(asciiBytes("\nendstream\nendobj\n"));

    offsets[contentObj] = offset;
    push(asciiBytes(`${contentObj} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`));
  });

  const xrefStart = offset;
  // 对象总数：1(Catalog) + 1(Pages) + 每页 3 个（Page/Image/Content）
  const size = 3 + 3 * images.length;
  // xref 子条目必须恰好 20 字节：10 位偏移 + 空格 + 5 位生成号 + 空格 + n/f + 2 字节行尾
  let xref = "xref\n0 " + size + "\n0000000000 65535 f \n";
  for (let i = 1; i < size; i++) {
    xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  push(asciiBytes(xref));
  push(asciiBytes(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`));

  return concatBytes(chunks);
}

module.exports = { buildImagePdf };

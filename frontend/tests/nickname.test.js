import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { checkNickname, MAX_LEN } = require("../miniprogram/utils/nickname.js");

test("正常昵称去掉首尾空白后返回", () => {
  assert.equal(checkNickname("  爸爸  "), "爸爸");
  assert.equal(checkNickname("琪琪妈"), "琪琪妈");
  assert.equal(checkNickname("A"), "A");
});

test("清掉内部换行与制表符", () => {
  assert.equal(checkNickname("爸\n爸"), "爸爸");
  assert.equal(checkNickname("爸\t爸"), "爸爸");
  assert.equal(checkNickname("爸\r\n爸"), "爸爸");
});

test("空昵称与纯空白被拒", () => {
  for (const bad of ["", "   ", "\n", "\t ", null, undefined]) {
    assert.throws(() => checkNickname(bad), /昵称不能为空/, `输入: ${JSON.stringify(bad)}`);
  }
});

test("「我」被拒（创建/加入家庭不许拿默认昵称充数）", () => {
  assert.throws(() => checkNickname("我"), /区分家人/);
  assert.throws(() => checkNickname("  我  "), /区分家人/); // trim 后仍是「我」
});

test("超长被拒，且按码点计数（emoji 算 1 个字）", () => {
  // 用 repeat 生成，避免手数字数出错
  const cn12 = "昵".repeat(12);
  assert.equal(checkNickname(cn12), cn12);
  assert.throws(() => checkNickname("昵".repeat(13)), /最多 12 个字/);
  // 12 个 emoji：按 UTF-16 length 算是 24，按码点是 12 → 应通过
  const emoji12 = "🍎".repeat(12);
  assert.equal(checkNickname(emoji12), emoji12);
  assert.throws(() => checkNickname("🍎".repeat(13)), /最多 12 个字/);
});

test("非字符串输入被容错字符串化，不会抛类型错误", () => {
  assert.equal(checkNickname(123), "123"); // 数字无害
  assert.equal(checkNickname(["爸"]), "爸"); // 单元素数组
  assert.throws(() => checkNickname({}), /最多 12 个字/); // [object Object] 超长
  assert.throws(() => checkNickname([]), /昵称不能为空/); // 空数组 → 空串
});

test("MAX_LEN 导出值为 12", () => {
  assert.equal(MAX_LEN, 12);
});

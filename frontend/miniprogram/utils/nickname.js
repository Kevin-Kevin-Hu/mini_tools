// 昵称规则（家庭场景）。
// 创建家庭 / 加入家庭 / 修改昵称都必须显式设置昵称：家人之间要能互相区分，
// 所以禁止空昵称，也禁止拿「我」充数（家庭成员列表里显示「我」对别人没有意义）。
// API 层与页面层双重校验，这里是被两边复用的纯函数。
const MAX_LEN = 12;

// 校验并规范化昵称；不合法时 throw Error（message 直接给用户看）。
function checkNickname(raw) {
  // 先去掉内部换行/制表符（trim 只能去首尾，中间的换行会把成员列表撑变形）
  const nick = String(raw == null ? "" : raw)
    .replace(/[\r\n\t]/g, "")
    .trim();
  if (!nick) throw new Error("昵称不能为空");
  if (nick === "我") throw new Error("家庭里要有能区分家人的称呼，不能叫「我」");
  // 按码点算长度：昵称可能含 emoji，'🍎'.length 是 2 但用户眼里是 1 个字
  if (Array.from(nick).length > MAX_LEN)
    throw new Error("昵称最多 " + MAX_LEN + " 个字");
  return nick;
}

module.exports = { checkNickname, MAX_LEN };

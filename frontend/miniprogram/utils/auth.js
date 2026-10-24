// 登录/身份：微信静默登录（wx.login → 云 auth.signInWithWechat），不再自行持有 AppSecret。
// 家庭与昵称从云数据库 profiles 表读取，数据按 owner_id 与用户身份绑定（与家庭无关）。
const { cloud } = require("./cloud");

function getAppid() {
  try {
    return wx.getAccountInfoSync().miniProgram.appId;
  } catch (_e) {
    return "";
  }
}

function wxLogin() {
  return new Promise((resolve, reject) =>
    wx.login({
      success: (r) => resolve(r.code),
      fail: (e) => reject(new Error(e.errMsg || "微信登录失败")),
    })
  );
}

// 读取当前用户的 profile（家庭 + 昵称），无则返回 null
async function getProfile() {
  const { data } = await cloud.database.from("profiles").select("*").maybeSingle();
  return data || null;
}

// 读取家庭成员（同家庭的成员由 RLS 放开可见）
async function getMembers(familyCode) {
  if (!familyCode) return [];
  try {
    const { data, error } = await cloud.database
      .from("family_members")
      .select("id, owner_id, nickname, role, created_at")
      .eq("family_code", familyCode)
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data || []).map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      nickname: row.nickname || "家庭成员",
      role: row.role || "member",
    }));
  } catch (_e) {
    return [];
  }
}

function toMe(session, profile, members) {
  return {
    user: {
      // id 用 owner_id（= auth.uid()），与家庭成员表里的 owner_id 对齐，才能判断「（我）」
      id: (profile && profile.owner_id) || (session && session.user && session.user.id) || "",
      nickname:
        (profile && profile.nickname) || (session && session.user && session.user.name) || "",
    },
    family: profile && profile.family_code
      ? { code: profile.family_code, name: profile.family_name }
      : null,
    members: members || [],
  };
}

// 确保已登录：本地会话优先；失效则重新 wx.login → signInWithWechat
async function ensureLogin() {
  let session = null;
  const cur = await cloud.auth.getSession();
  if (cur.error || !cur.data) {
    const code = await wxLogin();
    const r = await cloud.auth.signInWithWechat(code, getAppid());
    if (r.error) throw new Error(r.error.message || "微信登录失败");
    session = r.data;
  } else {
    session = cur.data;
  }
  const profile = await getProfile();
  const members = await getMembers(profile && profile.family_code);
  return toMe(session, profile, members);
}

// 登录且已加入家庭 → 返回 me；否则 null（由调用方引导去「我的」）
async function requireFamily() {
  const me = await ensureLogin();
  return me.family ? me : null;
}

async function refreshMe() {
  const cur = await cloud.auth.getSession();
  const profile = await getProfile();
  const members = await getMembers(profile && profile.family_code);
  return toMe(cur.data, profile, members);
}

module.exports = { getAppid, ensureLogin, requireFamily, refreshMe };

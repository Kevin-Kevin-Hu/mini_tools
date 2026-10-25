// 业务接口：全部走云 SDK（auth 自动带会话，RLS 按 owner_id 隔离）。
// 不再需要手动 token；请求打到云固定网关 mp-api.app.workbuddy.host，规避网页域名拦截。
const { cloud } = require("./cloud");
const { checkNickname } = require("./nickname");

function fail(error) {
  if (!error) return null;
  return new Error(error.message || (error.code ? String(error.code) : "请求失败"));
}

// 读取/写入当前用户的 profile（家庭 + 昵称）
async function upsertProfile(patch) {
  const existing = await cloud.database.from("profiles").select("*").maybeSingle();
  if (existing.data) {
    const { error } = await cloud.database
      .from("profiles")
      .update(patch)
      .eq("id", existing.data.id);
    if (error) throw fail(error);
  } else {
    const { error } = await cloud.database.from("profiles").insert(patch);
    if (error) throw fail(error);
  }
}

function genFamilyCode() {
  // 6 位家庭码，排除易混淆字符 I/O/0/1
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---------- 小程序用户域：家庭 + 昵称 ----------
const mp = {
  // 新建家庭：生成并写入 families（唯一家庭码），再把自身 profile 关联到该家庭。
  // nickname 必填：家庭内要靠昵称区分家人（见 utils/nickname.js）。
  async createFamily(name, nickname) {
    checkNickname(nickname);
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = genFamilyCode();
      const { data, error } = await cloud.database
        .from("families")
        .insert({ code, name })
        .select();
      if (!error) {
        // 昵称一并写进 profile，保证 profiles 与 family_members 两处一致
        await upsertProfile({
          nickname,
          family_code: data[0].code,
          family_name: name,
          role: "owner",
        });
        await mp.addMember(data[0].code, nickname, "owner");
        return { code: data[0].code, name };
      }
      if (error && error.code === "23505") continue; // 家庭码唯一冲突，换一个重试
      throw fail(error);
    }
    throw new Error("生成家庭码失败，请重试");
  },
  async joinFamily(rawCode, nickname) {
    checkNickname(nickname); // 加入家庭同样必须设置昵称
    const code = (rawCode || "").toUpperCase();
    const { data, error } = await cloud.database
      .from("families")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (error) throw fail(error);
    if (!data) throw new Error("家庭码不存在");
    await upsertProfile({
      nickname,
      family_code: data.code,
      family_name: data.name,
      role: "member",
    });
    await mp.addMember(data.code, nickname, "member");
    return { code: data.code, name: data.name };
  },
  async renameFamily(name) {
    const p = await cloud.database.from("profiles").select("*").maybeSingle();
    if (!p.data || !p.data.family_code) throw new Error("尚未加入家庭");
    const { error } = await cloud.database
      .from("families")
      .update({ name })
      .eq("code", p.data.family_code);
    if (error) throw fail(error);
    await upsertProfile({ family_name: name });
  },
  async leaveFamily() {
    const p = await cloud.database.from("profiles").select("*").maybeSingle();
    if (p.data && p.data.family_code) {
      await mp.removeMember(p.data.family_code);
    }
    await upsertProfile({ family_code: null, family_name: null, role: null });
  },
  async updateMe(nickname) {
    checkNickname(nickname); // 昵称不允许改成空或「我」
    await upsertProfile({ nickname });
    // 同步家庭成员列表里的昵称（家庭成员展示的是 family_members 表）
    const p = await cloud.database.from("profiles").select("*").maybeSingle();
    if (p.data && p.data.family_code) {
      const { error } = await cloud.database
        .from("family_members")
        .update({ nickname })
        .eq("owner_id", p.data.owner_id)
        .eq("family_code", p.data.family_code);
      if (error) throw fail(error);
    }
  },
  // 家庭成员列表（按家庭码查询；RLS 保证只能读到同家庭的成员）
  async members(familyCode) {
    const { data, error } = await cloud.database
      .from("family_members")
      .select("id, owner_id, nickname, role, created_at")
      .eq("family_code", familyCode)
      .order("created_at", { ascending: true });
    if (error) throw fail(error);
    return (data || []).map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      nickname: row.nickname || "家庭成员",
      role: row.role || "member",
    }));
  },
  // 加入/创建家庭时登记一条成员记录
  async addMember(familyCode, nickname, role) {
    const p = await cloud.database.from("profiles").select("*").maybeSingle();
    if (!p.data) return;
    const { error } = await cloud.database.from("family_members").insert({
      owner_id: p.data.owner_id,
      family_code: familyCode,
      nickname: nickname || p.data.nickname || "家庭成员",
      role: role || "member",
    });
    if (error) throw fail(error);
  },
  // 退出家庭：移除自己的成员记录
  async removeMember(familyCode) {
    const p = await cloud.database.from("profiles").select("*").maybeSingle();
    if (!p.data) return;
    const { error } = await cloud.database
      .from("family_members")
      .delete()
      .eq("owner_id", p.data.owner_id)
      .eq("family_code", familyCode);
    if (error) throw fail(error);
  },
};

// ---------- daily_plan ----------
const dp = {
  // 孩子用户（归属当前微信用户）
  async users() {
    const { data, error } = await cloud.database
      .from("child_users")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw fail(error);
    return data || [];
  },
  async createUser(name) {
    const { data, error } = await cloud.database.from("child_users").insert({ name }).select();
    if (error) throw fail(error);
    return data[0];
  },
  async renameUser(id, name) {
    const { error } = await cloud.database.from("child_users").update({ name }).eq("id", id);
    if (error) throw fail(error);
  },
  async deleteUser(id) {
    // 连带删除该孩子用户下的计划
    await cloud.database.from("plans").delete().eq("child_user_id", id);
    const { error } = await cloud.database.from("child_users").delete().eq("id", id);
    if (error) throw fail(error);
  },
  // 计划（归属某个孩子用户）
  async plans(childUserId) {
    const { data, error } = await cloud.database
      .from("plans")
      .select("*")
      .eq("child_user_id", childUserId)
      .order("plan_date", { ascending: false });
    if (error) throw fail(error);
    return data || [];
  },
  async plan(id) {
    const { data, error } = await cloud.database.from("plans").select("*").eq("id", id).single();
    if (error) throw fail(error);
    const row = data;
    return { plan: { ...row, user_id: row.child_user_id }, tasks: row.tasks || [] };
  },
  async createPlan(childUserId, planDate, firstStart) {
    const { data, error } = await cloud.database
      .from("plans")
      .insert({
        child_user_id: childUserId,
        plan_date: planDate,
        first_start: firstStart || "07:00",
        day_label: "",
        tasks: [],
      })
      .select();
    if (error) throw fail(error);
    return { id: data[0].id };
  },
  async copyPlan(id, planDate) {
    const { data, error } = await cloud.database.from("plans").select("*").eq("id", id).single();
    if (error) throw fail(error);
    const src = data;
    const { error: e2 } = await cloud.database.from("plans").insert({
      child_user_id: src.child_user_id,
      plan_date: planDate,
      first_start: src.first_start,
      day_label: src.day_label || "",
      tasks: src.tasks || [],
    });
    if (e2) throw fail(e2);
  },
  async deletePlan(id) {
    const { error } = await cloud.database.from("plans").delete().eq("id", id);
    if (error) throw fail(error);
  },
  async updatePlan(id, patch) {
    const { error } = await cloud.database.from("plans").update(patch).eq("id", id);
    if (error) throw fail(error);
  },
  async saveTasks(id, tasks) {
    const { error } = await cloud.database.from("plans").update({ tasks }).eq("id", id);
    if (error) throw fail(error);
  },
  // 常用任务
  async commonTasks() {
    const { data, error } = await cloud.database
      .from("common_tasks")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw fail(error);
    return data || [];
  },
  async createCommon(body) {
    const { data, error } = await cloud.database
      .from("common_tasks")
      .insert({
        title: body.title,
        detail: body.detail || "",
        duration_min: body.duration_min || 30,
        rest_after_min: body.rest_after_min || 0,
        kind: body.kind || "task",
      })
      .select();
    if (error) throw fail(error);
    return data[0];
  },
  async updateCommon(id, body) {
    const { error } = await cloud.database.from("common_tasks").update(body).eq("id", id);
    if (error) throw fail(error);
  },
  async deleteCommon(id) {
    const { error } = await cloud.database.from("common_tasks").delete().eq("id", id);
    if (error) throw fail(error);
  },
};

// ---------- experiments（等量代换记录） ----------
async function addExperiment(toolId, params, result, correct) {
  const { error } = await cloud.database.from("experiments").insert({
    tool_id: toolId,
    params: typeof params === "string" ? params : JSON.stringify(params),
    result: result || "",
    correct: correct ? 1 : 0,
  });
  if (error) throw fail(error);
}

module.exports = { dp, mp, addExperiment };

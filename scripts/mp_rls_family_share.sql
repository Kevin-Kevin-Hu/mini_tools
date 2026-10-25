-- =====================================================================
-- 家庭数据共享：孩子 / 计划 / 常用任务（2026-10-25 执行）
-- 应用：wbapp_05aJ7qUN2BFYi0c3ZA7Om3（EduPace 小程序）
--
-- 背景：此前 child_users / plans / common_tasks 只有 owner_id = auth.uid()
-- 一条策略，数据按微信账号（openid）私有隔离。新用户加入家庭后「选孩子」
-- 列表是空的——家庭只用于展示成员名单，不共享数据。
--
-- 本次改动：三张表各加一条 *_family 策略（FOR ALL），与既有 *_owner 策略
-- 是 OR 关系（PostgreSQL 多条 permissive 策略取并集），因此：
--   · 同家庭成员（family_members 有交集 family_code）可读可写彼此的
--     孩子、计划、常用任务；
--   · 未加入家庭的用户行为完全不变（仍然只看/改自己的）；
--   · 无法把行"送"给家庭外的人（WITH CHECK 同时挡住 owner_id 改写）。
--
-- 实现要点（不引入 SECURITY DEFINER）：
--   直接借用 family_members 当"成员名录"——它本身已有同家庭可读策略
--   （family_members_family_read），子查询全程在既有 RLS 内求值。
--   plans 靠 child_user_id 挂到孩子上，所以必须与 child_users 一起放开，
--   只放开前者仍然看不到计划。
--
-- 可逆：删除对应 DROP POLICY 即回到"各自私有"，不触碰任何数据。
--
-- 执行方式：每条语句单独一次 exec_sql（mode=migrate）。本文件为归档，
-- 已被执行过，勿重复跑（策略已存在，DROP 段保证了幂等）。
-- =====================================================================

-- ---------- child_users ----------
DROP POLICY IF EXISTS child_users_family ON public.child_users;

CREATE POLICY child_users_family ON public.child_users FOR ALL TO anon, authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = child_users.owner_id
      AND fm.family_code IN (
        SELECT fm2.family_code FROM public.family_members fm2
        WHERE fm2.owner_id = auth.uid()
      )
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = child_users.owner_id
      AND fm.family_code IN (
        SELECT fm2.family_code FROM public.family_members fm2
        WHERE fm2.owner_id = auth.uid()
      )
  )
);

-- ---------- plans ----------
DROP POLICY IF EXISTS plans_family ON public.plans;

CREATE POLICY plans_family ON public.plans FOR ALL TO anon, authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = plans.owner_id
      AND fm.family_code IN (
        SELECT fm2.family_code FROM public.family_members fm2
        WHERE fm2.owner_id = auth.uid()
      )
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = plans.owner_id
      AND fm.family_code IN (
        SELECT fm2.family_code FROM public.family_members fm2
        WHERE fm2.owner_id = auth.uid()
      )
  )
);

-- ---------- common_tasks ----------
DROP POLICY IF EXISTS common_tasks_family ON public.common_tasks;

CREATE POLICY common_tasks_family ON public.common_tasks FOR ALL TO anon, authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = common_tasks.owner_id
      AND fm.family_code IN (
        SELECT fm2.family_code FROM public.family_members fm2
        WHERE fm2.owner_id = auth.uid()
      )
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = common_tasks.owner_id
      AND fm.family_code IN (
        SELECT fm2.family_code FROM public.family_members fm2
        WHERE fm2.owner_id = auth.uid()
      )
  )
);

-- =====================================================================
-- 验证记录（2026-10-25，用策略表达式等价回放，非真实角色切换）
--
-- 可见性（USING）：
--   新成员 wx:oUG33xYh…ICwUY   孩子 1 / 计划 1   ← 修复目标
--   爸爸   wx:oUG33xfK…ekdY   孩子 1 / 计划 1   ← 原有行为不变
--   陌生人 wx:STRANGER_TEST_000  孩子 0 / 计划 0  ← 隔离有效
--   （common_tasks 全表为空，三角色均为 0）
--
-- 可写性（WITH CHECK）：
--   新成员写自己名下     → 允许
--   新成员写爸爸名下     → 允许（同家庭可改）
--   新成员转给陌生人     → 拒绝（防"送行"）
--   未加家庭者写自己名下 → 允许（关键回归保护）
--
-- ⚠️ 若不写 `owner_id = auth.uid() OR` 前缀，未加入家庭的用户连"给自己
-- 新建孩子"都会被 WITH CHECK 拒掉——这是首版方案里的回归，已修正。
-- =====================================================================

-- 回滚（如需回到"各自私有"）：
-- DROP POLICY IF EXISTS child_users_family  ON public.child_users;
-- DROP POLICY IF EXISTS plans_family        ON public.plans;
-- DROP POLICY IF EXISTS common_tasks_family ON public.common_tasks;

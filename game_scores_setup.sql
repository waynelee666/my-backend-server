-- ============================================================
-- TaskFlow 娱乐中心《谁先到 1 万？》· Supabase 建表/升级脚本
-- 用法：Supabase Dashboard → SQL Editor → 粘贴执行（一次性）
--
-- 说明：排行榜按「到达 1 万所用的赌博次数」从少到多排。
--       win_gambles = null 表示这个账号还没到过 1 万。
--       干苦力不算赌博；摸球/信封/三门/圣彼得堡入场/1000 元关卡各算 1 次。
-- ============================================================

-- 1) 新项目直接建表
create table if not exists public.game_scores (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text,
  money       numeric not null default 0,
  best_money  numeric not null default 0,
  wins        integer not null default 0,
  plays       bigint  not null default 0,
  win_gambles integer,
  updated_at  timestamptz not null default now()
);

-- 2) 已经建过表的老项目：补上本次新增的列
alter table public.game_scores add column if not exists win_gambles integer;

-- 3) 行级安全：所有人可看排行榜，只能写自己的行
alter table public.game_scores enable row level security;

drop policy if exists "game_scores_select_all" on public.game_scores;
create policy "game_scores_select_all" on public.game_scores
  for select using (true);

drop policy if exists "game_scores_insert_own" on public.game_scores;
create policy "game_scores_insert_own" on public.game_scores
  for insert with check (auth.uid() = user_id);

drop policy if exists "game_scores_update_own" on public.game_scores;
create policy "game_scores_update_own" on public.game_scores
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) 权限（游客也要能读排行榜）
grant select on public.game_scores to anon, authenticated;
grant insert, update on public.game_scores to authenticated;

-- 5) 排名索引：赌博次数少的在前，没到过 1 万的（null）排最后
create index if not exists game_scores_win_gambles_idx
  on public.game_scores (win_gambles asc nulls last, best_money desc);

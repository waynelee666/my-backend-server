-- ============================================================
-- TaskFlow 计划功能 · Supabase 建表脚本
-- 用法：Supabase 后台 → SQL Editor → 粘贴执行（一次性）
-- 说明：单行 JSON 存储（跟 goal_data 同套路），每个用户一行
-- ============================================================

create table if not exists public.plan_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plan_data enable row level security;

drop policy if exists "plan_select_own" on public.plan_data;
create policy "plan_select_own" on public.plan_data
  for select using (auth.uid() = user_id);

drop policy if exists "plan_insert_own" on public.plan_data;
create policy "plan_insert_own" on public.plan_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "plan_update_own" on public.plan_data;
create policy "plan_update_own" on public.plan_data
  for update using (auth.uid() = user_id);

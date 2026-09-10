-- ============================================================
-- TaskFlow B计划面板 · Supabase 建表脚本
-- 用法：Supabase 后台 → SQL Editor → 粘贴执行（一次性）
--
-- 说明：单行 JSON。每日勾选记录 + 「本周任务」的手改覆盖，
--       都塞在 data 字段里，形状由前端的 bplanNormalize() 校验。
--       与 plans.js 的 plan_data 完全同构。
-- ============================================================

create table if not exists public.bplan_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 开启行级安全（RLS）
alter table public.bplan_data enable row level security;

-- 策略：每个用户只能读写自己的数据（写法与 med_setup.sql 一致，可重复执行）
drop policy if exists "bplan_data_select_own" on public.bplan_data;
create policy "bplan_data_select_own" on public.bplan_data
  for select using (auth.uid() = user_id);

drop policy if exists "bplan_data_insert_own" on public.bplan_data;
create policy "bplan_data_insert_own" on public.bplan_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "bplan_data_update_own" on public.bplan_data;
create policy "bplan_data_update_own" on public.bplan_data
  for update using (auth.uid() = user_id);

drop policy if exists "bplan_data_delete_own" on public.bplan_data;
create policy "bplan_data_delete_own" on public.bplan_data
  for delete using (auth.uid() = user_id);

-- user_id 是主键，本身就是索引，不需要像 med_ticks 那样额外建索引。

-- ============================================================
-- TaskFlow 滴药监督 · Supabase 建表脚本
-- 用法：Supabase 后台 → SQL Editor → 粘贴执行（一次性）
--
-- 说明：只存「哪一天打了勾」。每周是否达成、结算日归属哪一期，
--       全部由打卡记录 + 当前时间推导，不需要额外的结算表。
-- ============================================================

create table if not exists public.med_ticks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tick_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, tick_date)
);

-- 开启行级安全（RLS）
alter table public.med_ticks enable row level security;

-- 策略：每个用户只能读写自己的数据
drop policy if exists "med_ticks_select_own" on public.med_ticks;
create policy "med_ticks_select_own" on public.med_ticks
  for select using (auth.uid() = user_id);

drop policy if exists "med_ticks_insert_own" on public.med_ticks;
create policy "med_ticks_insert_own" on public.med_ticks
  for insert with check (auth.uid() = user_id);

drop policy if exists "med_ticks_update_own" on public.med_ticks;
create policy "med_ticks_update_own" on public.med_ticks
  for update using (auth.uid() = user_id);

drop policy if exists "med_ticks_delete_own" on public.med_ticks;
create policy "med_ticks_delete_own" on public.med_ticks
  for delete using (auth.uid() = user_id);

-- 索引
create index if not exists med_ticks_user_date_idx
  on public.med_ticks (user_id, tick_date desc);

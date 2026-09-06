-- ============================================================
-- TaskFlow 记账功能 · Supabase 建表脚本
-- 用法：Supabase 后台 → SQL Editor → 粘贴执行（一次性）
-- ============================================================

-- 1. 建表
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  category text not null check (category in ('daily', 'shopping', 'saving')),
  note text,
  spent_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- 2. 开启行级安全（RLS）
alter table public.ledger_entries enable row level security;

-- 3. 策略：每个用户只能读写自己的数据
drop policy if exists "ledger_select_own" on public.ledger_entries;
create policy "ledger_select_own" on public.ledger_entries
  for select using (auth.uid() = user_id);

drop policy if exists "ledger_insert_own" on public.ledger_entries;
create policy "ledger_insert_own" on public.ledger_entries
  for insert with check (auth.uid() = user_id);

drop policy if exists "ledger_update_own" on public.ledger_entries;
create policy "ledger_update_own" on public.ledger_entries
  for update using (auth.uid() = user_id);

drop policy if exists "ledger_delete_own" on public.ledger_entries;
create policy "ledger_delete_own" on public.ledger_entries
  for delete using (auth.uid() = user_id);

-- 4. 索引（加快按用户 + 日期查询）
create index if not exists ledger_entries_user_date_idx
  on public.ledger_entries (user_id, spent_date desc);

-- ============================================================
-- 购物清单（记账模块附带）
-- ============================================================

create table if not exists public.ledger_shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.ledger_shopping_items enable row level security;

drop policy if exists "shopping_select_own" on public.ledger_shopping_items;
create policy "shopping_select_own" on public.ledger_shopping_items
  for select using (auth.uid() = user_id);

drop policy if exists "shopping_insert_own" on public.ledger_shopping_items;
create policy "shopping_insert_own" on public.ledger_shopping_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "shopping_update_own" on public.ledger_shopping_items;
create policy "shopping_update_own" on public.ledger_shopping_items
  for update using (auth.uid() = user_id);

drop policy if exists "shopping_delete_own" on public.ledger_shopping_items;
create policy "shopping_delete_own" on public.ledger_shopping_items
  for delete using (auth.uid() = user_id);

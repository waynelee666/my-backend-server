-- ============================================================
-- TaskFlow 《谁先到 1 万？》· 服务端每日重开限制
-- 用法：Supabase Dashboard → SQL Editor → 粘贴执行（可重复执行）
--
-- 规则：每个登录账号每天最多重开 5 次，跨设备共享。
--       日期按中国时区（Asia/Shanghai）计算，0 点自动翻篇。
--       游客没有账号，仍使用浏览器本机次数。
--       创始人账号 waynelee / 2810303976@qq.com 无限次重开，不扣次数。
-- ============================================================

-- 1) 每个账号每天一行
create table if not exists public.game_restarts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  used       integer not null default 0 check (used >= 0 and used <= 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- 2) 只允许通过下面的函数读写，客户端不能直接改表
alter table public.game_restarts enable row level security;
revoke all on public.game_restarts from anon, authenticated;

-- 3) 创始人判断：以登录令牌里的邮箱为准（客户端改不了），
--    再兜底查 profiles 里的用户名（username 有唯一约束，别人抢不走）。
create or replace function public.game_is_founder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = '2810303976@qq.com'
      or exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and lower(username) = 'waynelee'
      );
$$;

-- 4) 查询今天还剩几次（给确认框显示用）
--    返回值：0~5 = 普通账号剩余次数；-2 = 创始人无限次。
create or replace function public.game_restart_status()
returns integer
language sql
security definer
set search_path = public
as $$
  select case
    when public.game_is_founder() then -2
    else greatest(0, 5 - coalesce((
      select used
      from public.game_restarts
      where user_id = auth.uid()
        and day = (now() at time zone 'Asia/Shanghai')::date
    ), 0))
  end;
$$;

-- 5) 原子地扣一次：
--    返回扣完后的剩余次数（0~4）；今天已经用完返回 -1；创始人返回 -2（不扣）。
create or replace function public.game_restart_consume()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_day  date := (now() at time zone 'Asia/Shanghai')::date;
  v_used integer;
begin
  if v_uid is null then
    return -1;
  end if;

  -- 创始人无限次：不写表、不扣次数，直接返回 -2
  if public.game_is_founder() then
    return -2;
  end if;

  insert into public.game_restarts (user_id, day, used, updated_at)
  values (v_uid, v_day, 1, now())
  on conflict (user_id, day) do update
    set used = public.game_restarts.used + 1,
        updated_at = now()
    where public.game_restarts.used < 5
  returning used into v_used;

  -- WHERE 没命中（已经 5 次）时不会 RETURNING，v_used 仍为 null
  if v_used is null then
    return -1;
  end if;

  return greatest(0, 5 - v_used);
end;
$$;

-- 6) 权限：只有登录用户可以调用，游客走本机限制
revoke all on function public.game_is_founder()     from public;
revoke all on function public.game_restart_status()  from public;
revoke all on function public.game_restart_consume() from public;
grant execute on function public.game_restart_status()  to authenticated, service_role;
grant execute on function public.game_restart_consume() to authenticated, service_role;

-- 7) 让 PostgREST 立刻识别新函数
notify pgrst, 'reload schema';

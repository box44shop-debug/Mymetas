-- Metas.com.br — metas compartilhadas (convites por link)
alter table public.goals add column if not exists is_shared boolean not null default false;

create table if not exists public.goal_members (
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (goal_id,user_id)
);
create index if not exists goal_members_user_idx on public.goal_members(user_id,joined_at desc);

create table if not exists public.goal_totals (
  goal_id uuid primary key references public.goals(id) on delete cascade,
  total_cents bigint not null default 0 check (total_cents>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.goal_invites (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null
);
alter table public.goal_members enable row level security;
alter table public.goal_totals enable row level security;
alter table public.goal_invites enable row level security;

create or replace function private.register_goal_owner()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
 insert into public.goal_members(goal_id,user_id,member_role) values(new.id,new.owner_id,'owner') on conflict(goal_id,user_id) do nothing;
 insert into public.goal_totals(goal_id,total_cents) values(new.id,0) on conflict(goal_id) do nothing;
 return new;
end; $$;
drop trigger if exists register_goal_owner_trigger on public.goals;
create trigger register_goal_owner_trigger after insert on public.goals for each row execute function private.register_goal_owner();

create or replace function private.is_goal_member(p_goal_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.goal_members gm where gm.goal_id=p_goal_id and gm.user_id=p_user_id); $$;
revoke all on function private.is_goal_member(uuid,uuid) from public,anon;
grant execute on function private.is_goal_member(uuid,uuid) to authenticated;
revoke all on function private.register_goal_owner() from public,anon,authenticated;

drop policy if exists goals_select_own on public.goals;
drop policy if exists goals_select_owner_or_member on public.goals;
create policy goals_select_owner_or_member on public.goals for select to authenticated using (
 (owner_id=(select auth.uid()) or (select private.is_goal_member(id,(select auth.uid()))))
 and (select private.is_account_eligible((select auth.uid())))
);
drop policy if exists contributions_insert_own_goal on public.contributions;
drop policy if exists contributions_insert_owner_or_member on public.contributions;
create policy contributions_insert_owner_or_member on public.contributions for insert to authenticated with check (
 user_id=(select auth.uid()) and contribution_date<=current_date
 and (select private.is_account_eligible((select auth.uid())))
 and exists(select 1 from public.goals g where g.id=goal_id and g.status='active'
 and (g.owner_id=(select auth.uid()) or (select private.is_goal_member(g.id,(select auth.uid())))))
);

create or replace function private.update_goal_total()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
 insert into public.goal_totals(goal_id,total_cents,updated_at) values(new.goal_id,new.amount_cents,now())
 on conflict(goal_id) do update set total_cents=public.goal_totals.total_cents+excluded.total_cents,updated_at=now();
 return new;
end; $$;
drop trigger if exists update_goal_total_trigger on public.contributions;
create trigger update_goal_total_trigger after insert on public.contributions for each row execute function private.update_goal_total();
revoke all on function private.update_goal_total() from public,anon,authenticated;

insert into public.goal_members(goal_id,user_id,member_role) select id,owner_id,'owner' from public.goals on conflict(goal_id,user_id) do nothing;
insert into public.goal_totals(goal_id,total_cents)
select g.id,coalesce(sum(c.amount_cents),0)::bigint from public.goals g left join public.contributions c on c.goal_id=g.id group by g.id
on conflict(goal_id) do update set total_cents=excluded.total_cents,updated_at=now();

create policy goal_members_select_self on public.goal_members for select to authenticated using(user_id=(select auth.uid()));
create policy goal_totals_select_member on public.goal_totals for select to authenticated using(
 (select private.is_goal_member(goal_id,(select auth.uid())))
 or exists(select 1 from public.goals g where g.id=goal_id and g.owner_id=(select auth.uid()))
);
revoke all on public.goal_invites from anon,authenticated;
revoke all on public.goal_members from anon,authenticated;
revoke all on public.goal_totals from anon,authenticated;
grant select on public.goal_members,public.goal_totals to authenticated;

create or replace view public.goals_summary with(security_invoker=true) as
select g.id,g.owner_id,g.name,g.description,g.category,g.target_cents,g.target_date,g.status,g.created_at,
 coalesce(gt.total_cents,0)::bigint as saved_cents,g.is_shared
from public.goals g left join public.goal_totals gt on gt.goal_id=g.id;
grant select on public.goals_summary to authenticated;

create or replace function public.create_goal_invite(p_goal_id uuid)
returns text language plpgsql security definer set search_path=''
as $$ declare v_token text; v_active_count integer; begin
 if auth.uid() is null then raise exception 'É necessário entrar na conta.'; end if;
 if not exists(select 1 from public.goals g where g.id=p_goal_id and g.owner_id=auth.uid() and g.is_shared=true and g.status='active') then
  raise exception 'Somente o responsável por uma meta compartilhada ativa pode convidar.';
 end if;
 select count(*) into v_active_count from public.goal_invites where goal_id=p_goal_id and used_at is null and expires_at>now();
 if v_active_count>=5 then raise exception 'Esta meta já possui cinco convites ativos. Aguarde o vencimento ou use um convite existente.'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.goal_invites(goal_id,token_hash,created_by,expires_at)
 values(p_goal_id,encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid(),now()+interval '7 days');
 return v_token;
end; $$;
revoke all on function public.create_goal_invite(uuid) from public,anon;
grant execute on function public.create_goal_invite(uuid) to authenticated;

create or replace function public.accept_goal_invite(p_token text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_invite public.goal_invites%rowtype; begin
 if auth.uid() is null then raise exception 'Entre na sua conta para aceitar o convite.'; end if;
 if not private.is_account_eligible(auth.uid()) then raise exception 'Esta conta ainda não está autorizada a participar.'; end if;
 if p_token is null or length(p_token)<>64 then raise exception 'Convite inválido ou expirado.'; end if;
 select * into v_invite from public.goal_invites where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and used_at is null and expires_at>now() for update;
 if not found then raise exception 'Convite inválido, expirado ou já utilizado.'; end if;
 if v_invite.created_by=auth.uid() then raise exception 'Você já é responsável por esta meta.'; end if;
 insert into public.goal_members(goal_id,user_id,member_role) values(v_invite.goal_id,auth.uid(),'member') on conflict(goal_id,user_id) do nothing;
 update public.goal_invites set used_at=now(),accepted_by=auth.uid() where id=v_invite.id;
 return v_invite.goal_id;
end; $$;
revoke all on function public.accept_goal_invite(text) from public,anon;
grant execute on function public.accept_goal_invite(text) to authenticated;

create policy goal_invites_deny_all on public.goal_invites for all to anon,authenticated using(false) with check(false);
create index if not exists goal_invites_goal_idx on public.goal_invites(goal_id);
create index if not exists goal_invites_created_by_idx on public.goal_invites(created_by);
create index if not exists goal_invites_accepted_by_idx on public.goal_invites(accepted_by);

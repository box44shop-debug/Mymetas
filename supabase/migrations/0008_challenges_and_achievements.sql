-- Desafios opcionais e conquistas baseadas em ações reais do usuário.
create table public.challenge_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  metric text not null check (metric in ('contributions_count','contribution_days','goals_count')),
  target_value integer not null check (target_value > 0),
  duration_days integer not null check (duration_days between 1 and 90),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.challenge_participations (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenge_definitions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','completed','expired')),
  progress integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  unique(challenge_id,user_id),
  check (ends_at > started_at),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create index challenge_participations_user_idx on public.challenge_participations(user_id, started_at desc);
create index challenge_participations_active_idx on public.challenge_participations(user_id, status, ends_at);

alter table public.challenge_definitions enable row level security;
alter table public.challenge_participations enable row level security;

create policy challenge_definitions_read_authenticated on public.challenge_definitions
for select to authenticated using (active = true);
create policy challenge_participations_read_own on public.challenge_participations
for select to authenticated using (user_id = (select auth.uid()));
create policy challenge_participations_join_own on public.challenge_participations
for insert to authenticated with check (
  user_id = (select auth.uid()) and status = 'active' and progress = 0
  and completed_at is null and ends_at > now() and ends_at <= now() + interval '90 days'
  and private.is_account_eligible((select auth.uid()))
  and exists (select 1 from public.challenge_definitions d where d.id = challenge_id and d.active = true)
);

revoke all on public.challenge_definitions from anon, authenticated;
revoke all on public.challenge_participations from anon, authenticated;
grant select on public.challenge_definitions, public.challenge_participations to authenticated;
grant insert on public.challenge_participations to authenticated;

insert into public.challenge_definitions (slug,title,description,metric,target_value,duration_days,display_order)
values
 ('primeiro-passo','Primeiro passo','Registre sua primeira contribuição em uma Caixinha.','contributions_count',1,7,1),
 ('plano-no-papel','Plano no papel','Crie uma nova Caixinha para um objetivo financeiro.','goals_count',1,7,2),
 ('constancia','Constância','Registre três contribuições ao longo do desafio.','contributions_count',3,30,3),
 ('dias-de-cuidado','Dias de cuidado','Faça contribuições em três dias diferentes.','contribution_days',3,30,4),
 ('cinco-passos','Cinco passos','Registre cinco contribuições, no seu ritmo.','contributions_count',5,30,5)
on conflict (slug) do update set title=excluded.title, description=excluded.description,
 metric=excluded.metric, target_value=excluded.target_value, duration_days=excluded.duration_days,
 display_order=excluded.display_order, active=true;

create or replace function private.refresh_user_challenges(p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_part record; v_progress integer;
begin
 if p_user_id is null then return; end if;
 for v_part in
  select cp.id,cp.started_at,cp.ends_at,cp.status,d.metric,d.target_value
  from public.challenge_participations cp join public.challenge_definitions d on d.id=cp.challenge_id
  where cp.user_id=p_user_id and cp.status='active' for update of cp
 loop
  if v_part.ends_at<=now() then
   update public.challenge_participations set status='expired' where id=v_part.id and status='active';
   continue;
  end if;
  if v_part.metric='contributions_count' then
   select count(*)::integer into v_progress from public.contributions c
   where c.user_id=p_user_id and c.created_at>=v_part.started_at and c.created_at<=v_part.ends_at;
  elsif v_part.metric='contribution_days' then
   select count(distinct c.contribution_date)::integer into v_progress from public.contributions c
   where c.user_id=p_user_id and c.created_at>=v_part.started_at and c.created_at<=v_part.ends_at;
  else
   select count(*)::integer into v_progress from public.goals g
   where g.owner_id=p_user_id and g.created_at>=v_part.started_at and g.created_at<=v_part.ends_at;
  end if;
  update public.challenge_participations set progress=v_progress,
   status=case when v_progress>=v_part.target_value then 'completed' else 'active' end,
   completed_at=case when v_progress>=v_part.target_value then coalesce(completed_at,now()) else null end
  where id=v_part.id and status='active';
 end loop;
end;
$$;
revoke all on function private.refresh_user_challenges(uuid) from public,anon,authenticated;

create or replace function private.refresh_challenges_after_contribution()
returns trigger language plpgsql security definer set search_path=''
as $$ begin perform private.refresh_user_challenges(new.user_id); return new; end; $$;
create or replace function private.refresh_challenges_after_goal()
returns trigger language plpgsql security definer set search_path=''
as $$ begin perform private.refresh_user_challenges(new.owner_id); return new; end; $$;

drop trigger if exists refresh_challenges_after_contribution_trigger on public.contributions;
create trigger refresh_challenges_after_contribution_trigger after insert on public.contributions
for each row execute function private.refresh_challenges_after_contribution();
drop trigger if exists refresh_challenges_after_goal_trigger on public.goals;
create trigger refresh_challenges_after_goal_trigger after insert on public.goals
for each row execute function private.refresh_challenges_after_goal();
revoke all on function private.refresh_challenges_after_contribution() from public,anon,authenticated;
revoke all on function private.refresh_challenges_after_goal() from public,anon,authenticated;

-- O servidor define início e prazo; o cliente não pode antecipar progresso.
create or replace function private.prepare_challenge_participation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_duration integer;
begin
 if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception 'Participação inválida.'; end if;
 if not private.is_account_eligible(auth.uid()) then raise exception 'Esta conta ainda não está autorizada a participar.'; end if;
 select d.duration_days into v_duration from public.challenge_definitions d where d.id=new.challenge_id and d.active=true;
 if not found then raise exception 'Este desafio não está disponível.'; end if;
 new.started_at:=now(); new.ends_at:=now()+make_interval(days=>v_duration);
 new.status:='active'; new.progress:=0; new.completed_at:=null;
 return new;
end;
$$;
drop trigger if exists prepare_challenge_participation_trigger on public.challenge_participations;
create trigger prepare_challenge_participation_trigger before insert on public.challenge_participations
for each row execute function private.prepare_challenge_participation();
revoke all on function private.prepare_challenge_participation() from public,anon,authenticated;

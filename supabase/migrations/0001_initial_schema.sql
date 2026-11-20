-- Metas.com.br — primeira migração
-- Valores monetários são armazenados em centavos (BIGINT).
-- Contribuições são declarações manuais; a plataforma não movimenta dinheiro.

create extension if not exists pgcrypto;

create type public.goal_category as enum (
  'casa','veiculo','viagem','familia','estudos','negocio','emergencia','outros'
);
create type public.goal_status as enum ('active','completed','paused','archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  birth_date date,
  guardian_approval_status text not null default 'not_required'
    check (guardian_approval_status in ('not_required','pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name varchar(80) not null check (length(trim(name)) between 2 and 80),
  description varchar(500),
  category public.goal_category not null default 'outros',
  target_cents bigint not null check (target_cents > 0),
  target_date date,
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  contribution_date date not null default current_date,
  note varchar(240),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

create index goals_owner_created_idx on public.goals(owner_id, created_at desc);
create index contributions_goal_date_idx on public.contributions(goal_id, contribution_date desc);
create index contributions_user_idx on public.contributions(user_id, created_at desc);

-- O perfil nasce a partir dos metadados do cadastro. Menores ficam pendentes
-- e não podem usar os módulos financeiros até existir autorização válida.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_birth_date date;
  v_status text := 'not_required';
begin
  begin
    v_birth_date := (new.raw_user_meta_data ->> 'birth_date')::date;
  exception when others then
    raise exception 'Data de nascimento obrigatória e inválida.';
  end;

  if v_birth_date is null then
    raise exception 'Data de nascimento obrigatória.';
  end if;
  if v_birth_date > current_date then
    raise exception 'A data de nascimento não pode estar no futuro.';
  end if;

  if v_birth_date > (current_date - interval '18 years')::date then
    v_status := 'pending';
  end if;

  insert into public.profiles(id, birth_date, guardian_approval_status)
  values (new.id, v_birth_date, v_status);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_account_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.id = (select auth.uid())
      and p.birth_date is not null
      and p.birth_date <= current_date
      and (
        p.birth_date <= (current_date - interval '18 years')::date
        or p.guardian_approval_status = 'approved'
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.contributions enable row level security;

create policy "profile_select_own" on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy "profile_update_own" on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "goals_select_own" on public.goals
for select to authenticated using (
  owner_id = (select auth.uid())
  and public.is_account_eligible((select auth.uid()))
);
create policy "goals_insert_own" on public.goals
for insert to authenticated with check (
  owner_id = (select auth.uid())
  and public.is_account_eligible((select auth.uid()))
);
create policy "goals_update_own" on public.goals
for update to authenticated using (
  owner_id = (select auth.uid())
  and public.is_account_eligible((select auth.uid()))
) with check (owner_id = (select auth.uid()));
create policy "goals_delete_own" on public.goals
for delete to authenticated using (
  owner_id = (select auth.uid())
  and public.is_account_eligible((select auth.uid()))
);

-- Não há UPDATE ou DELETE para contribuições: correções/estornos serão
-- implementados como eventos auditáveis em uma migração posterior.
create policy "contributions_select_own_goal" on public.contributions
for select to authenticated using (
  user_id = (select auth.uid())
  and public.is_account_eligible((select auth.uid()))
);
create policy "contributions_insert_own_goal" on public.contributions
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.goals g
    where g.id = goal_id
      and g.owner_id = (select auth.uid())
      and g.status = 'active'
  )
  and contribution_date <= current_date
  and public.is_account_eligible((select auth.uid()))
);

create or replace function public.add_goal_contribution(
  p_goal_id uuid,
  p_amount_cents bigint,
  p_note text,
  p_contribution_date date,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'O valor da contribuição deve ser maior que zero.';
  end if;
  if p_contribution_date is null or p_contribution_date > current_date then
    raise exception 'A data da contribuição é inválida.';
  end if;
  if not exists (
    select 1 from public.goals
    where id = p_goal_id and owner_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Meta não encontrada ou não está ativa.';
  end if;

  insert into public.contributions(
    goal_id,user_id,amount_cents,note,contribution_date,idempotency_key
  ) values (
    p_goal_id,auth.uid(),p_amount_cents,nullif(trim(p_note),''),p_contribution_date,p_idempotency_key
  )
  on conflict (user_id,idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.contributions
    where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end;
$$;

create or replace view public.goals_summary
with (security_invoker = true)
as
select
  g.id,g.owner_id,g.name,g.description,g.category,g.target_cents,
  g.target_date,g.status,g.created_at,
  coalesce(sum(c.amount_cents),0)::bigint as saved_cents
from public.goals g
left join public.contributions c on c.goal_id = g.id
group by g.id;

grant select on public.goals_summary to authenticated;
revoke all on function public.add_goal_contribution(uuid,bigint,text,date,uuid) from public, anon;
revoke all on function public.is_account_eligible(uuid) from public, anon;
grant execute on function public.add_goal_contribution(uuid,bigint,text,date,uuid) to authenticated;
grant execute on function public.is_account_eligible(uuid) to authenticated;

-- Segurança: não permitir que o cliente altere campos de controle do perfil.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.birth_date is distinct from old.birth_date
     or new.guardian_approval_status is distinct from old.guardian_approval_status then
    raise exception 'Campos protegidos do perfil não podem ser alterados diretamente.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile_fields_trigger
before update on public.profiles
for each row execute procedure public.protect_profile_fields();

-- Privilégios explícitos para a Data API. RLS continua sendo a barreira
-- de autorização por linha; estes GRANTs apenas permitem as operações necessárias.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert on public.contributions to authenticated;
grant select on public.goals_summary to authenticated;

-- Funções acionadas exclusivamente por triggers não são endpoints da API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_fields() from public, anon, authenticated;

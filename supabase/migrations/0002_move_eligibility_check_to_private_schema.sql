-- Retira a função SECURITY DEFINER do schema exposto pela API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_account_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
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

revoke all on function private.is_account_eligible(uuid) from public, anon;
grant execute on function private.is_account_eligible(uuid) to authenticated;

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals
for select to authenticated using (
  owner_id = (select auth.uid())
  and (select private.is_account_eligible((select auth.uid())))
);

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals
for insert to authenticated with check (
  owner_id = (select auth.uid())
  and (select private.is_account_eligible((select auth.uid())))
);

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals
for update to authenticated using (
  owner_id = (select auth.uid())
  and (select private.is_account_eligible((select auth.uid())))
) with check (owner_id = (select auth.uid()));

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals
for delete to authenticated using (
  owner_id = (select auth.uid())
  and (select private.is_account_eligible((select auth.uid())))
);

drop policy if exists "contributions_select_own_goal" on public.contributions;
create policy "contributions_select_own_goal" on public.contributions
for select to authenticated using (
  user_id = (select auth.uid())
  and (select private.is_account_eligible((select auth.uid())))
);

drop policy if exists "contributions_insert_own_goal" on public.contributions;
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
  and (select private.is_account_eligible((select auth.uid())))
);

revoke all on function public.is_account_eligible(uuid) from public, anon, authenticated;
drop function public.is_account_eligible(uuid);

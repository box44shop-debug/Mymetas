-- Integridade financeira: idempotência estrita e privilégios mínimos.
create or replace function public.add_goal_contribution(
  p_goal_id uuid,
  p_amount_cents bigint,
  p_note text,
  p_contribution_date date,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
set search_path=''
as $$
declare
  v_id uuid;
  v_existing public.contributions%rowtype;
  v_note varchar(240);
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para registrar uma contribuição.';
  end if;
  if p_goal_id is null then
    raise exception 'Selecione uma Caixinha válida.';
  end if;
  if p_idempotency_key is null then
    raise exception 'Não foi possível validar esta solicitação. Tente novamente.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'O valor da contribuição deve ser maior que zero.';
  end if;
  if p_contribution_date is null or p_contribution_date > current_date then
    raise exception 'A data da contribuição é inválida.';
  end if;
  v_note := nullif(trim(p_note), '');
  if v_note is not null and char_length(v_note) > 240 then
    raise exception 'A observação deve ter no máximo 240 caracteres.';
  end if;
  if not private.is_account_eligible(auth.uid()) then
    raise exception 'Esta conta ainda não está autorizada a registrar contribuições.';
  end if;
  if not exists (
    select 1 from public.goals g
    where g.id=p_goal_id and g.status='active'
      and (g.owner_id=auth.uid() or private.is_goal_member(g.id,auth.uid()))
  ) then
    raise exception 'Meta não encontrada ou não está ativa para sua conta.';
  end if;

  insert into public.contributions(goal_id,user_id,amount_cents,note,contribution_date,idempotency_key)
  values(p_goal_id,auth.uid(),p_amount_cents,v_note,p_contribution_date,p_idempotency_key)
  on conflict(user_id,idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then return v_id; end if;

  select c.* into v_existing from public.contributions c
  where c.user_id=auth.uid() and c.idempotency_key=p_idempotency_key;
  if not found then
    raise exception 'Não foi possível confirmar a contribuição. Tente novamente.';
  end if;
  if v_existing.goal_id is distinct from p_goal_id
     or v_existing.amount_cents is distinct from p_amount_cents
     or v_existing.contribution_date is distinct from p_contribution_date
     or coalesce(v_existing.note,'') is distinct from coalesce(v_note,'') then
    raise exception 'Esta solicitação já foi utilizada com dados diferentes. Atualize a tela e tente novamente.';
  end if;
  return v_existing.id;
end;
$$;

revoke all on function public.add_goal_contribution(uuid,bigint,text,date,uuid) from anon;
grant execute on function public.add_goal_contribution(uuid,bigint,text,date,uuid) to authenticated;

-- Sem alterações/exclusões diretas em registros financeiros; correções devem ser auditáveis.
revoke all on public.contributions from anon, authenticated;
grant select, insert on public.contributions to authenticated;
revoke all on public.goals from anon;
grant select, insert, update, delete on public.goals to authenticated;
revoke all on public.goal_members, public.goal_totals, public.goal_invites from anon, authenticated;
grant select on public.goal_members, public.goal_totals to authenticated;
revoke all on public.challenge_definitions from anon, authenticated;
grant select on public.challenge_definitions to authenticated;
revoke all on public.challenge_participations from anon, authenticated;
grant select, insert on public.challenge_participations to authenticated;

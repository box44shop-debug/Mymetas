-- Corrige validação de observação e impede datas retroativas de inflarem desafios de dias distintos.
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
  v_note text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para registrar uma contribuição.'; end if;
  if p_goal_id is null then raise exception 'Selecione uma Caixinha válida.'; end if;
  if p_idempotency_key is null then raise exception 'Não foi possível validar esta solicitação. Tente novamente.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'O valor da contribuição deve ser maior que zero.'; end if;
  if p_contribution_date is null or p_contribution_date > current_date then raise exception 'A data da contribuição é inválida.'; end if;
  v_note := nullif(trim(p_note), '');
  if v_note is not null and char_length(v_note) > 240 then raise exception 'A observação deve ter no máximo 240 caracteres.'; end if;
  if not private.is_account_eligible(auth.uid()) then raise exception 'Esta conta ainda não está autorizada a registrar contribuições.'; end if;
  if not exists (
    select 1 from public.goals g where g.id=p_goal_id and g.status='active'
      and (g.owner_id=auth.uid() or private.is_goal_member(g.id,auth.uid()))
  ) then raise exception 'Meta não encontrada ou não está ativa para sua conta.'; end if;

  insert into public.contributions(goal_id,user_id,amount_cents,note,contribution_date,idempotency_key)
  values(p_goal_id,auth.uid(),p_amount_cents,v_note,p_contribution_date,p_idempotency_key)
  on conflict(user_id,idempotency_key) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;

  select c.* into v_existing from public.contributions c
  where c.user_id=auth.uid() and c.idempotency_key=p_idempotency_key;
  if not found then raise exception 'Não foi possível confirmar a contribuição. Tente novamente.'; end if;
  if v_existing.goal_id is distinct from p_goal_id
     or v_existing.amount_cents is distinct from p_amount_cents
     or v_existing.contribution_date is distinct from p_contribution_date
     or coalesce(v_existing.note,'') is distinct from coalesce(v_note,'') then
    raise exception 'Esta solicitação já foi utilizada com dados diferentes. Atualize a tela e tente novamente.';
  end if;
  return v_existing.id;
end;
$$;

create or replace function private.refresh_user_challenges(p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_part record; v_progress integer;
begin
  if p_user_id is null then return; end if;
  for v_part in
    select cp.id,cp.challenge_id,cp.started_at,cp.ends_at,cp.status,d.metric,d.target_value
    from public.challenge_participations cp
    join public.challenge_definitions d on d.id=cp.challenge_id
    where cp.user_id=p_user_id and cp.status='active'
    for update of cp
  loop
    if v_part.ends_at <= now() then
      update public.challenge_participations set status='expired' where id=v_part.id and status='active';
      continue;
    end if;
    if v_part.metric='contributions_count' then
      select count(*)::integer into v_progress from public.contributions c
      where c.user_id=p_user_id and c.created_at>=v_part.started_at and c.created_at<=v_part.ends_at;
    elsif v_part.metric='contribution_days' then
      -- Conta o dia do registro no app, não a data retroativa declarada pelo usuário.
      select count(distinct (c.created_at at time zone 'America/Sao_Paulo')::date)::integer into v_progress
      from public.contributions c
      where c.user_id=p_user_id and c.created_at>=v_part.started_at and c.created_at<=v_part.ends_at;
    else
      select count(*)::integer into v_progress from public.goals g
      where g.owner_id=p_user_id and g.created_at>=v_part.started_at and g.created_at<=v_part.ends_at;
    end if;
    update public.challenge_participations
    set progress=v_progress,
        status=case when v_progress>=v_part.target_value then 'completed' else 'active' end,
        completed_at=case when v_progress>=v_part.target_value then coalesce(completed_at,now()) else null end
    where id=v_part.id and status='active';
  end loop;
end;
$$;
revoke all on function private.refresh_user_challenges(uuid) from public,anon,authenticated;

-- Torna a aceitação de convite idempotente sem permitir reutilização por terceiros.
create or replace function public.accept_goal_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invite public.goal_invites%rowtype;
  v_goal_status text;
  v_goal_shared boolean;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para aceitar o convite.';
  end if;

  if not private.is_account_eligible(auth.uid()) then
    raise exception 'Esta conta ainda não está autorizada a participar.';
  end if;

  if p_token is null or length(p_token) <> 64 then
    raise exception 'Convite inválido ou expirado.';
  end if;

  -- Bloqueia a linha durante a decisão, evitando duas aceitações concorrentes.
  select i.*
    into v_invite
    from public.goal_invites i
   where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;

  if not found then
    raise exception 'Convite inválido ou expirado.';
  end if;

  -- Repetição legítima do mesmo usuário: devolve sucesso sem alterar nada.
  if v_invite.used_at is not null then
    if v_invite.accepted_by = auth.uid()
       and exists (
         select 1
           from public.goal_members gm
          where gm.goal_id = v_invite.goal_id
            and gm.user_id = auth.uid()
       ) then
      return v_invite.goal_id;
    end if;

    raise exception 'Este convite já foi utilizado.';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'Convite inválido ou expirado.';
  end if;

  select g.status, g.is_shared
    into v_goal_status, v_goal_shared
    from public.goals g
   where g.id = v_invite.goal_id;

  if not found or v_goal_status <> 'active' or v_goal_shared is distinct from true then
    raise exception 'Convite inválido, expirado ou meta indisponível.';
  end if;

  if v_invite.created_by = auth.uid() then
    raise exception 'Você já é responsável por esta meta.';
  end if;

  insert into public.goal_members(goal_id, user_id, member_role)
  values (v_invite.goal_id, auth.uid(), 'member')
  on conflict (goal_id, user_id) do nothing;

  update public.goal_invites
     set used_at = now(),
         accepted_by = auth.uid()
   where id = v_invite.id;

  return v_invite.goal_id;
end;
$$;

revoke all on function public.accept_goal_invite(text) from public, anon;
grant execute on function public.accept_goal_invite(text) to authenticated;

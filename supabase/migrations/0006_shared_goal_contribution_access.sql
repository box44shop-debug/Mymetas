-- A RPC de contribuição também autoriza membros ativos da meta.
create or replace function public.add_goal_contribution(
 p_goal_id uuid,p_amount_cents bigint,p_note text,p_contribution_date date,p_idempotency_key uuid
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; begin
 if p_amount_cents is null or p_amount_cents<=0 then raise exception 'O valor da contribuição deve ser maior que zero.'; end if;
 if p_contribution_date is null or p_contribution_date>current_date then raise exception 'A data da contribuição é inválida.'; end if;
 if not exists(select 1 from public.goals g where g.id=p_goal_id and g.status='active'
   and (g.owner_id=auth.uid() or (select private.is_goal_member(g.id,(select auth.uid()))))) then
   raise exception 'Meta não encontrada ou não está ativa para sua conta.'; end if;
 insert into public.contributions(goal_id,user_id,amount_cents,note,contribution_date,idempotency_key)
 values(p_goal_id,auth.uid(),p_amount_cents,nullif(trim(p_note),''),p_contribution_date,p_idempotency_key)
 on conflict(user_id,idempotency_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.contributions where user_id=auth.uid() and idempotency_key=p_idempotency_key; end if;
 return v_id; end; $$;
revoke all on function public.add_goal_contribution(uuid,bigint,text,date,uuid) from public,anon;
grant execute on function public.add_goal_contribution(uuid,bigint,text,date,uuid) to authenticated;

-- Convites só podem ser consumidos enquanto a meta continuar compartilhada e ativa.
create or replace function public.accept_goal_invite(p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_invite public.goal_invites%rowtype; begin
 if auth.uid() is null then raise exception 'Entre na sua conta para aceitar o convite.'; end if;
 if not private.is_account_eligible(auth.uid()) then raise exception 'Esta conta ainda não está autorizada a participar.'; end if;
 if p_token is null or length(p_token)<>64 then raise exception 'Convite inválido ou expirado.'; end if;
 select i.* into v_invite from public.goal_invites i join public.goals g on g.id=i.goal_id
 where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and i.used_at is null and i.expires_at>now()
 and g.is_shared=true and g.status='active' for update of i;
 if not found then raise exception 'Convite inválido, expirado ou meta indisponível.'; end if;
 if v_invite.created_by=auth.uid() then raise exception 'Você já é responsável por esta meta.'; end if;
 insert into public.goal_members(goal_id,user_id,member_role) values(v_invite.goal_id,auth.uid(),'member') on conflict(goal_id,user_id) do nothing;
 update public.goal_invites set used_at=now(),accepted_by=auth.uid() where id=v_invite.id;
 return v_invite.goal_id; end; $$;
revoke all on function public.accept_goal_invite(text) from public,anon;
grant execute on function public.accept_goal_invite(text) to authenticated;

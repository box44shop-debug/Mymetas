-- pgcrypto está no schema extensions; search_path permanece vazio por segurança.
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
create or replace function public.accept_goal_invite(p_token text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_invite public.goal_invites%rowtype; begin
 if auth.uid() is null then raise exception 'Entre na sua conta para aceitar o convite.'; end if;
 if not private.is_account_eligible(auth.uid()) then raise exception 'Esta conta ainda não está autorizada a participar.'; end if;
 if p_token is null or length(p_token)<>64 then raise exception 'Convite inválido ou expirado.'; end if;
 select * into v_invite from public.goal_invites where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and used_at is null and expires_at>now() for update;
 if not found then raise exception 'Convite inválido ou expirado.'; end if;
 if v_invite.created_by=auth.uid() then raise exception 'Você já é responsável por esta meta.'; end if;
 insert into public.goal_members(goal_id,user_id,member_role) values(v_invite.goal_id,auth.uid(),'member') on conflict(goal_id,user_id) do nothing;
 update public.goal_invites set used_at=now(),accepted_by=auth.uid() where id=v_invite.id;
 return v_invite.goal_id;
end; $$;
revoke all on function public.create_goal_invite(uuid) from public,anon;
revoke all on function public.accept_goal_invite(text) from public,anon;
grant execute on function public.create_goal_invite(uuid) to authenticated;
grant execute on function public.accept_goal_invite(text) to authenticated;
drop policy if exists goal_invites_deny_all on public.goal_invites;
create policy goal_invites_deny_all on public.goal_invites for all to anon,authenticated using(false) with check(false);
create index if not exists goal_invites_goal_idx on public.goal_invites(goal_id);
create index if not exists goal_invites_created_by_idx on public.goal_invites(created_by);
create index if not exists goal_invites_accepted_by_idx on public.goal_invites(accepted_by);

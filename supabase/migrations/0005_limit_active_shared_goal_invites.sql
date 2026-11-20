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

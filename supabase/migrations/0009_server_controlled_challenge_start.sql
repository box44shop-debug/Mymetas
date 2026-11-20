-- O servidor define início e prazo; o cliente não pode antecipar progresso.
create or replace function private.prepare_challenge_participation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_duration integer;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Participação inválida.';
  end if;

  if not private.is_account_eligible(auth.uid()) then
    raise exception 'Esta conta ainda não está autorizada a participar.';
  end if;

  select d.duration_days into v_duration
    from public.challenge_definitions d
   where d.id=new.challenge_id and d.active=true;

  if not found then
    raise exception 'Este desafio não está disponível.';
  end if;

  new.started_at := now();
  new.ends_at := now() + make_interval(days => v_duration);
  new.status := 'active';
  new.progress := 0;
  new.completed_at := null;
  return new;
end;
$$;

drop trigger if exists prepare_challenge_participation_trigger on public.challenge_participations;
create trigger prepare_challenge_participation_trigger
before insert on public.challenge_participations
for each row execute function private.prepare_challenge_participation();

revoke all on function private.prepare_challenge_participation() from public, anon, authenticated;

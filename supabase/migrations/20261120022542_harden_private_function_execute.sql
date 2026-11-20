-- Hardening das funções internas SECURITY DEFINER.
-- As funções de trigger continuam sendo executadas pelo mecanismo de triggers;
-- a revogação impede chamadas diretas pelos papéis da API.
REVOKE ALL ON FUNCTION private.refresh_user_challenges(uuid) FROM PUBLIC, anon, authenticated;

-- Estas duas funções são usadas por políticas RLS e permanecem disponíveis
-- somente para usuários autenticados.
REVOKE ALL ON FUNCTION private.is_account_eligible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_account_eligible(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.is_goal_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_goal_member(uuid, uuid) TO authenticated;

-- Funções internas invocadas exclusivamente por triggers.
REVOKE ALL ON FUNCTION private.prepare_challenge_participation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_challenges_after_contribution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_challenges_after_goal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.register_goal_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.update_goal_total() FROM PUBLIC, anon, authenticated;

-- Defense in depth: no table-level grants inherited by PUBLIC.
revoke all on public.contributions, public.goals, public.goal_members,
  public.goal_totals, public.goal_invites, public.challenge_definitions,
  public.challenge_participations from public;

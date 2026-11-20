import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.API_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error('Supabase local credentials are required.');

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const identities = ['cristianose1978@gmail.com', 'cristianobackup1979@gmail.com'];
const clients = [];

async function registerAndLogin(email) {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const password = `Flow-Test-${randomUUID()}!`;
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { birth_date: '1978-01-01' } }
  });
  if (error) throw new Error(`signup failed for ${email}: ${error.message}`);
  if (!data.user?.id) throw new Error(`signup returned no user for ${email}`);
  if (!data.session) {
    const { error: confirmError } = await admin.auth.admin.updateUserById(data.user.id, { email_confirm: true });
    if (confirmError) throw new Error(`local confirmation failed for ${email}: ${confirmError.message}`);
  }
  const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError || login.user?.id !== data.user.id || !login.session) {
    throw new Error(`login failed for ${email}: ${loginError?.message ?? 'session mismatch'}`);
  }
  return { client, userId: data.user.id };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const first = await registerAndLogin(identities[0]);
const second = await registerAndLogin(identities[1]);
clients.push(first.client, second.client);
const owner = first.client;
const member = second.client;

async function createGoal(client, ownerId, name, isShared) {
  const { data, error } = await client.from('goals').insert({
    owner_id: ownerId,
    name,
    category: 'outros',
    target_cents: 50000,
    status: 'active',
    is_shared: isShared
  }).select('id').single();
  if (error || !data?.id) throw new Error(`goal creation failed: ${error?.message ?? 'missing id'}`);
  return data.id;
}

const sharedGoalId = await createGoal(owner, first.userId, 'Teste de meta compartilhada', true);
const privateGoalId = await createGoal(owner, first.userId, 'Teste de meta privada', false);

const { data: challenge, error: challengeError } = await owner
  .from('challenge_definitions')
  .select('id')
  .eq('slug', 'primeiro-passo')
  .eq('active', true)
  .single();
if (challengeError || !challenge?.id) throw new Error(`challenge lookup failed: ${challengeError?.message ?? 'missing challenge'}`);

const { error: joinError } = await owner.from('challenge_participations').insert({
  challenge_id: challenge.id,
  user_id: first.userId
});
if (joinError) throw new Error(`challenge join failed: ${joinError.message}`);

const idempotencyKey = randomUUID();
const contributionArgs = {
  p_goal_id: sharedGoalId,
  p_amount_cents: 10000,
  p_note: 'Contribuição de teste',
  p_contribution_date: new Date().toISOString().slice(0, 10),
  p_idempotency_key: idempotencyKey
};
const { data: firstContribution, error: firstContributionError } = await owner.rpc('add_goal_contribution', contributionArgs);
if (firstContributionError) throw new Error(`owner contribution failed: ${firstContributionError.message}`);
const { data: duplicateContribution, error: duplicateError } = await owner.rpc('add_goal_contribution', contributionArgs);
if (duplicateError || duplicateContribution !== firstContribution) {
  throw new Error(`idempotent retry failed: ${duplicateError?.message ?? 'duplicate id mismatch'}`);
}

const { data: challengeProgress, error: challengeProgressError } = await owner
  .from('challenge_participations')
  .select('status,progress')
  .eq('challenge_id', challenge.id)
  .eq('user_id', first.userId)
  .single();
if (challengeProgressError || challengeProgress.status !== 'completed' || challengeProgress.progress !== 1) {
  throw new Error(`challenge progress trigger failed: ${challengeProgressError?.message ?? JSON.stringify(challengeProgress)}`);
}

const { data: inviteToken, error: inviteError } = await owner.rpc('create_goal_invite', { p_goal_id: sharedGoalId });
if (inviteError || typeof inviteToken !== 'string' || inviteToken.length !== 64) {
  throw new Error(`invite creation failed: ${inviteError?.message ?? 'invalid token'}`);
}

const { error: ownerAcceptError } = await owner.rpc('accept_goal_invite', { p_token: inviteToken });
assert(Boolean(ownerAcceptError), 'the owner must not be able to accept their own invite');

const { error: nonOwnerInviteError } = await member.rpc('create_goal_invite', { p_goal_id: sharedGoalId });
assert(Boolean(nonOwnerInviteError), 'a non-owner must not be able to create invites');

const { data: acceptedGoalId, error: acceptError } = await member.rpc('accept_goal_invite', { p_token: inviteToken });
if (acceptError || acceptedGoalId !== sharedGoalId) {
  throw new Error(`invite acceptance failed: ${acceptError?.message ?? 'goal id mismatch'}`);
}

const { error: reusedInviteError } = await member.rpc('accept_goal_invite', { p_token: inviteToken });
assert(Boolean(reusedInviteError), 'a used invite must not be accepted twice');

const memberContributionKey = randomUUID();
const { error: memberContributionError } = await member.rpc('add_goal_contribution', {
  p_goal_id: sharedGoalId,
  p_amount_cents: 5000,
  p_note: 'Contribuição do participante',
  p_contribution_date: new Date().toISOString().slice(0, 10),
  p_idempotency_key: memberContributionKey
});
if (memberContributionError) throw new Error(`member contribution failed: ${memberContributionError.message}`);

const { data: sharedSummary, error: summaryError } = await member
  .from('goals_summary')
  .select('id,saved_cents,is_shared')
  .eq('id', sharedGoalId)
  .single();
if (summaryError || sharedSummary.saved_cents !== 15000 || sharedSummary.is_shared !== true) {
  throw new Error(`shared summary failed: ${summaryError?.message ?? JSON.stringify(sharedSummary)}`);
}

const { data: privateLeak, error: privateQueryError } = await member
  .from('goals')
  .select('id')
  .eq('id', privateGoalId);
if (privateQueryError) throw new Error(`private goal isolation query failed: ${privateQueryError.message}`);
assert((privateLeak ?? []).length === 0, 'a participant must not see another user private goal');

console.log('PASS two-user signup and login');
console.log('PASS goal creation and owner registration');
console.log('PASS contribution idempotency (no duplicate amount)');
console.log('PASS challenge start and automatic completion');
console.log('PASS invite owner/member authorization and single-use acceptance');
console.log('PASS member contribution and shared total aggregation');
console.log('PASS private goal isolation between accounts');
console.log('PASS all core user flows in disposable local Supabase.');
for (const client of clients) await client.auth.signOut();

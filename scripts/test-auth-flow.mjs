import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const url = process.env.API_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error('Supabase local URL, anon key and service role key are required.');
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const identities = [
  'cristianose1978@gmail.com',
  'cristianobackup1979@gmail.com'
];

async function removeExisting(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email?.toLowerCase() === email);
  if (existing) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(existing.id);
    if (deleteError) throw deleteError;
  }
}

for (const email of identities) {
  await removeExisting(email);
  const password = `Local-Test-${randomBytes(18).toString('hex')}!`;
  const nextPassword = `Local-Updated-${randomBytes(18).toString('hex')}!`;
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  let userId;

  try {
    const { data: signup, error: signupError } = await client.auth.signUp({
      email,
      password,
      options: { data: { birth_date: '1978-01-01' } }
    });
    if (signupError) throw new Error(`signup failed for ${email}: ${signupError.message}`);
    if (!signup.user?.id) throw new Error(`signup returned no user for ${email}`);
    userId = signup.user.id;

    if (!signup.session) {
      const { error: confirmError } = await admin.auth.admin.updateUserById(userId, {
        email_confirm: true
      });
      if (confirmError) throw new Error(`local email confirmation failed for ${email}: ${confirmError.message}`);
    }

    const { data: login, error: loginError } = await client.auth.signInWithPassword({
      email,
      password
    });
    if (loginError || login.user?.id !== userId || !login.session) {
      throw new Error(`password login failed for ${email}: ${loginError?.message ?? 'session/user mismatch'}`);
    }

    const { data: current, error: currentError } = await client.auth.getUser();
    if (currentError || current.user?.id !== userId) {
      throw new Error(`getUser/session validation failed for ${email}`);
    }

    const { error: updateError } = await client.auth.updateUser({ password: nextPassword });
    if (updateError) throw new Error(`password update failed for ${email}: ${updateError.message}`);

    await client.auth.signOut();
    const { data: relogin, error: reloginError } = await client.auth.signInWithPassword({
      email,
      password: nextPassword
    });
    if (reloginError || relogin.user?.id !== userId || !relogin.session) {
      throw new Error(`login with updated password failed for ${email}: ${reloginError?.message ?? 'session/user mismatch'}`);
    }


    await client.auth.signOut();
    const { error: recoveryError } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:3000/redefinir-senha'
    });
    if (recoveryError) throw new Error(`password recovery request failed for ${email}: ${recoveryError.message}`);

    const inbucket = 'http://127.0.0.1:54324/api/v1';
    const mailbox = email.split('@')[0];
    let recoveryMessage;
    for (let attempt = 0; attempt < 20 && !recoveryMessage; attempt += 1) {
      const listResponse = await fetch(`${inbucket}/mailbox/${encodeURIComponent(mailbox)}`);
      if (!listResponse.ok) throw new Error(`Inbucket API returned ${listResponse.status}`);
      const list = await listResponse.json();
      const messages = Array.isArray(list) ? list : (list.messages ?? []);
      for (const message of messages) {
        const messageId = message.id ?? message.ID;
        if (!messageId) continue;
        const detailResponse = await fetch(`${inbucket}/mailbox/${encodeURIComponent(mailbox)}/${encodeURIComponent(messageId)}`);
        if (!detailResponse.ok) continue;
        const detail = await detailResponse.json();
        const content = `${detail.text ?? detail.Text ?? ''}\\n${detail.html ?? detail.HTML ?? ''}`.replace(/&amp;/g, '&');
        if (content.includes('type=recovery')) {
          recoveryMessage = content;
          break;
        }
      }
      if (!recoveryMessage) await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!recoveryMessage) throw new Error(`password recovery email was not delivered to local Mailpit for ${email}`);

    const urlMatch = recoveryMessage.match(/https?:\/\/[^\s"'<>]+/g)?.find(value => value.includes('type=recovery'));
    if (!urlMatch) throw new Error(`recovery link not found in local email for ${email}`);
    const recoveryUrl = new URL(urlMatch.replace(/&amp;/g, '&'));
    const tokenHash = recoveryUrl.searchParams.get('token_hash') ?? recoveryUrl.searchParams.get('token');
    if (!tokenHash) throw new Error(`recovery token not found in email link for ${email}`);

    const { data: verifiedRecovery, error: verifyRecoveryError } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery'
    });
    if (verifyRecoveryError || verifiedRecovery.user?.id !== userId || !verifiedRecovery.session) {
      throw new Error(`recovery link verification failed for ${email}: ${verifyRecoveryError?.message ?? 'session/user mismatch'}`);
    }

    const recoveryPassword = `Recovered-${randomBytes(18).toString('hex')}!`;
    const { error: recoveryUpdateError } = await client.auth.updateUser({ password: recoveryPassword });
    if (recoveryUpdateError) throw new Error(`password reset update failed for ${email}: ${recoveryUpdateError.message}`);

    await client.auth.signOut();
    const { data: recoveryLogin, error: recoveryLoginError } = await client.auth.signInWithPassword({
      email,
      password: recoveryPassword
    });
    if (recoveryLoginError || recoveryLogin.user?.id !== userId || !recoveryLogin.session) {
      throw new Error(`login after email password recovery failed for ${email}: ${recoveryLoginError?.message ?? 'session/user mismatch'}`);
    }

    console.log(`PASS email password recovery and reset: ${email}`);

    console.log(`PASS auth signup/login/session/password-update: ${email}`);
  } finally {
    await client.auth.signOut();
    if (userId) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) throw new Error(`test-user cleanup failed for ${email}: ${deleteError.message}`);
    }
  }
}

console.log('PASS all local auth smoke tests; temporary users were deleted.');

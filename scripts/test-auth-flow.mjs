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

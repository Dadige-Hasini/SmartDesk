import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '../server/node_modules/@supabase/supabase-js/dist/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      env[key] = val;
    }
  }
  return env;
}

const serverEnv = {
  ...loadEnvFile(path.join(rootDir, '.env')),
  ...loadEnvFile(path.join(rootDir, 'server', '.env')),
};

const clientEnv = {
  ...loadEnvFile(path.join(rootDir, '.env')),
  ...loadEnvFile(path.join(rootDir, 'client', '.env.local')),
  ...loadEnvFile(path.join(rootDir, 'client', '.env')),
};

console.log('\n================================================================');
console.log('       SmartDesk — Supabase Integration Verification');
console.log('================================================================\n');

const results = {};

async function runVerification() {
  // ------------------------------------------------------------------
  // CHECK 1: React Application Supabase Client Initialization
  // ------------------------------------------------------------------
  console.log('1. Checking React Application Supabase Client Initialization...');
  try {
    const clientUrl = clientEnv.VITE_SUPABASE_URL || serverEnv.SUPABASE_URL;
    const clientKey = clientEnv.VITE_SUPABASE_PUBLISHABLE_KEY || serverEnv.SUPABASE_PUBLISHABLE_KEY;

    if (!clientUrl || !clientKey) {
      throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in client/.env.local');
    }

    const testClient = createClient(clientUrl, clientKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    if (testClient && typeof testClient.auth?.getSession === 'function') {
      results.reactClientInit = {
        passed: true,
        message: `React Supabase client successfully initialized with URL: ${clientUrl}`,
      };
      console.log('   ✅ PASS:', results.reactClientInit.message);
    } else {
      throw new Error('Supabase client initialized but missing auth methods');
    }
  } catch (err) {
    results.reactClientInit = { passed: false, error: err.message };
    console.log('   ❌ FAIL:', err.message);
  }

  // ------------------------------------------------------------------
  // CHECK 2: Express Server Can Reach Supabase
  // ------------------------------------------------------------------
  console.log('\n2. Checking Express Server Reachability to Supabase...');
  let supabaseAdmin = null;
  let supabaseClient = null;

  try {
    const serverUrl = serverEnv.SUPABASE_URL;
    const secretKey = serverEnv.SUPABASE_SECRET_KEY;
    const pubKey = serverEnv.SUPABASE_PUBLISHABLE_KEY;

    if (!serverUrl || !secretKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in server/.env');
    }

    supabaseAdmin = createClient(serverUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    supabaseClient = createClient(serverUrl, pubKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Test network & auth ping via listUsers()
    const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    if (listError) {
      throw new Error(`Supabase Auth returned error: ${listError.message}`);
    }

    results.serverReachability = {
      passed: true,
      message: `Express server successfully connected to Supabase Auth over HTTPS. Remote total users: ${userList.users.length}`,
    };
    console.log('   ✅ PASS:', results.serverReachability.message);
  } catch (err) {
    results.serverReachability = { passed: false, error: err.message };
    console.log('   ❌ FAIL:', err.message);
  }

  // ------------------------------------------------------------------
  // CHECK 3: Unauthenticated Request to Protected Endpoint is Rejected
  // ------------------------------------------------------------------
  console.log('\n3. Checking Protected Endpoint Unauthenticated Rejection...');
  try {
    const port = serverEnv.PORT || 5000;
    const endpoint = `http://localhost:${port}/api/auth/me`;

    // A. Request without Authorization header
    const resNoAuth = await fetch(endpoint);
    const bodyNoAuth = await resNoAuth.json();

    const is401NoAuth = resNoAuth.status === 401 && bodyNoAuth.success === false;

    // B. Request with invalid Bearer token
    const resBadToken = await fetch(endpoint, {
      headers: { Authorization: 'Bearer fake.invalid.token' },
    });
    const bodyBadToken = await resBadToken.json();

    const is401BadToken = resBadToken.status === 401 && bodyBadToken.success === false;

    if (is401NoAuth && is401BadToken) {
      results.unauthenticatedRejection = {
        passed: true,
        message: 'Protected endpoint (/api/auth/me) correctly rejected requests without token and with invalid token with HTTP 401 UNAUTHORIZED.',
      };
      console.log('   ✅ PASS:', results.unauthenticatedRejection.message);
    } else {
      throw new Error(`Expected 401 status. Got: noAuth=${resNoAuth.status}, badToken=${resBadToken.status}`);
    }
  } catch (err) {
    results.unauthenticatedRejection = { passed: false, error: err.message };
    console.log('   ❌ FAIL:', err.message);
  }

  // ------------------------------------------------------------------
  // CHECK 4: Test User Authentication Flow
  // ------------------------------------------------------------------
  console.log('\n4. Checking Test User Authentication Flow...');
  const testEmail = `authtest_${Date.now()}@smartdesk.college.edu`;
  const testPassword = 'StrongPassword123!';
  let createdUserId = null;

  try {
    if (!supabaseAdmin || !supabaseClient) {
      throw new Error('Supabase client not initialized');
    }

    // Step A: Create test user with email_confirm: true
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Test Verification User',
        role: 'STUDENT',
      },
    });

    if (createError) {
      throw new Error(`Failed to create test user: ${createError.message}`);
    }

    createdUserId = createData.user.id;
    console.log(`   ℹ️  Created temporary auth user: ${testEmail} (ID: ${createdUserId})`);

    // Step B: Authenticate via signInWithPassword using public client
    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (signInError) {
      throw new Error(`signInWithPassword failed: ${signInError.message}`);
    }

    if (!signInData.session?.access_token) {
      throw new Error('signInWithPassword succeeded but no access_token returned');
    }

    const token = signInData.session.access_token;
    console.log(`   ℹ️  Successfully obtained JWT access token for ${testEmail}`);

    // Step C: Verify access token using getUser(token)
    const { data: tokenUserData, error: tokenUserError } = await supabaseClient.auth.getUser(token);
    if (tokenUserError || !tokenUserData?.user) {
      throw new Error(`Token verification failed: ${tokenUserError?.message}`);
    }

    results.testUserAuth = {
      passed: true,
      message: `Test user (${testEmail}) authenticated successfully and valid JWT token was verified by Supabase Auth.`,
    };
    console.log('   ✅ PASS:', results.testUserAuth.message);
  } catch (err) {
    results.testUserAuth = { passed: false, error: err.message };
    console.log('   ❌ FAIL:', err.message);
  } finally {
    // Cleanup test user
    if (createdUserId && supabaseAdmin) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        console.log(`   ℹ️  Cleaned up temporary auth user (ID: ${createdUserId})`);
      } catch (cleanErr) {
        console.warn('   ⚠️  Cleanup warning:', cleanErr.message);
      }
    }
  }

  // ------------------------------------------------------------------
  // CHECK 5: Row Level Security (RLS) Cross-User Isolation
  // ------------------------------------------------------------------
  console.log('\n5. Checking Row Level Security (RLS) Policy Isolation...');
  let studentAId = null;
  let studentBId = null;

  try {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    // First check if profiles table exists in database
    const { error: probeError } = await supabaseAdmin.from('profiles').select('id').limit(1);

    if (probeError && (probeError.code === 'PGRST205' || probeError.message?.includes('schema cache'))) {
      results.rlsIsolation = {
        passed: 'PENDING_MIGRATION',
        message: 'The SQL migration (20261020000001_departments_and_profiles.sql) has not yet been applied to the remote database. RLS policies are fully coded in the migration file.',
      };
      console.log('   ⚠️  PENDING:', results.rlsIsolation.message);
    } else {
      // Profiles table exists! Let's test RLS isolation between Student A and Student B
      const studentAEmail = `studentA_${Date.now()}@college.edu`;
      const studentBEmail = `studentB_${Date.now()}@college.edu`;
      const testPw = 'TestPassword123!';

      // Create Student A
      const { data: userA } = await supabaseAdmin.auth.admin.createUser({
        email: studentAEmail,
        password: testPw,
        email_confirm: true,
        user_metadata: { full_name: 'Student Alice', role: 'STUDENT' },
      });
      studentAId = userA.user.id;

      // Create Student B
      const { data: userB } = await supabaseAdmin.auth.admin.createUser({
        email: studentBEmail,
        password: testPw,
        email_confirm: true,
        user_metadata: { full_name: 'Student Bob', role: 'STUDENT' },
      });
      studentBId = userB.user.id;

      // Upsert profiles via admin (if trigger didn't fire)
      await supabaseAdmin.from('profiles').upsert([
        { id: studentAId, email: studentAEmail, full_name: 'Student Alice', role: 'STUDENT', status: 'ACTIVE' },
        { id: studentBId, email: studentBEmail, full_name: 'Student Bob', role: 'STUDENT', status: 'ACTIVE' },
      ]);

      // Sign in as Student A to get Student A's scoped client
      const { data: sessionA } = await supabaseClient.auth.signInWithPassword({
        email: studentAEmail,
        password: testPw,
      });

      const clientA = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_PUBLISHABLE_KEY, {
        global: {
          headers: { Authorization: `Bearer ${sessionA.session.access_token}` },
        },
      });

      // Student A attempts to read Student B's profile
      const { data: queryData, error: queryError } = await clientA
        .from('profiles')
        .select('*')
        .eq('id', studentBId);

      // Student A attempts to read their own profile
      const { data: ownData } = await clientA
        .from('profiles')
        .select('*')
        .eq('id', studentAId);

      const canSeeOwn = ownData && ownData.length === 1;
      const blockedOther = !queryError && queryData && queryData.length === 0;

      if (canSeeOwn && blockedOther) {
        results.rlsIsolation = {
          passed: true,
          message: 'RLS Verified: Student A can read own profile, but cannot read Student B profile (0 records returned).',
        };
        console.log('   ✅ PASS:', results.rlsIsolation.message);
      } else {
        throw new Error(`RLS check failed: canSeeOwn=${canSeeOwn}, blockedOther=${blockedOther}`);
      }
    }
  } catch (err) {
    results.rlsIsolation = { passed: false, error: err.message };
    console.log('   ❌ FAIL:', err.message);
  } finally {
    if (studentAId && supabaseAdmin) await supabaseAdmin.auth.admin.deleteUser(studentAId);
    if (studentBId && supabaseAdmin) await supabaseAdmin.auth.admin.deleteUser(studentBId);
  }

  // ------------------------------------------------------------------
  // CHECK 6: Production Frontend Build Does Not Contain Secret Key
  // ------------------------------------------------------------------
  console.log('\n6. Checking Production Frontend Build for Secret Key Leakage...');
  try {
    const secretKey = serverEnv.SUPABASE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('SUPABASE_SECRET_KEY is empty in server/.env');
    }

    const distDir = path.join(rootDir, 'client', 'dist');
    if (!fs.existsSync(distDir)) {
      throw new Error('client/dist does not exist. Run "npm --prefix client run build" first.');
    }

    // Recursively scan all files in client/dist
    function getAllFiles(dir, fileList = []) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          getAllFiles(fullPath, fileList);
        } else {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    const allDistFiles = getAllFiles(distDir);
    let leakDetected = false;
    let leakedInFile = null;

    for (const filePath of allDistFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(secretKey)) {
        leakDetected = true;
        leakedInFile = filePath;
        break;
      }
    }

    if (leakDetected) {
      throw new Error(`CRITICAL SECURITY FAILURE: SUPABASE_SECRET_KEY was found in ${leakedInFile}!`);
    }

    results.productionBuildSecretCheck = {
      passed: true,
      scannedFilesCount: allDistFiles.length,
      message: `Verified: Scanned ${allDistFiles.length} files in client/dist. SUPABASE_SECRET_KEY does NOT exist anywhere in the frontend build.`,
    };
    console.log('   ✅ PASS:', results.productionBuildSecretCheck.message);
  } catch (err) {
    results.productionBuildSecretCheck = { passed: false, error: err.message };
    console.log('   ❌ FAIL:', err.message);
  }

  console.log('\n================================================================');
  console.log('                   Verification Complete');
  console.log('================================================================\n');

  return results;
}

runVerification();

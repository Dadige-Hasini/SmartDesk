#!/usr/bin/env node

/**
 * SmartDesk — Development Super Admin Provisioning Script
 *
 * This script securely provisions or elevates a Super Administrator account
 * using the server-only Supabase service-role key.
 *
 * Usage:
 *   node scripts/provision-super-admin.js --email admin@college.edu --password <secret> --name "Admin User"
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('\n❌ ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY must be configured in .env to provision an administrator.\n');
  process.exit(1);
}

// Parse CLI flags
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = value;
    }
  }
  return parsed;
}

const args = parseArgs();
const email = args.email || process.env.ADMIN_EMAIL || 'admin@smartdesk.college.edu';
const password = args.password || process.env.ADMIN_PASSWORD;
const fullName = args.name || process.env.ADMIN_NAME || 'Super Administrator';

if (!password) {
  console.error('\n❌ ERROR: Password is required. Provide it via --password <secret> or ADMIN_PASSWORD env var.\n');
  process.exit(1);
}

if (password.length < 8) {
  console.error('\n❌ ERROR: Password must be at least 8 characters long for administrative accounts.\n');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function provisionAdmin() {
  console.log(`\n========================================================`);
  console.log(` Provisioning SmartDesk Super Administrator`);
  console.log(` Target Email: ${email}`);
  console.log(` Target Name:  ${fullName}`);
  console.log(`========================================================\n`);

  try {
    // 1. Check if user already exists in auth.users
    const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      throw new Error(`Failed to list auth users: ${listError.message}`);
    }

    const existingUser = userList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    let userId;

    if (existingUser) {
      console.log(`ℹ️  Found existing user account for ${email} (ID: ${existingUser.id}). Updating password and metadata...`);
      userId = existingUser.id;

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'SUPER_ADMIN',
        },
      });

      if (updateError) {
        throw new Error(`Failed to update auth user: ${updateError.message}`);
      }
    } else {
      console.log(`➕ Creating new user account in Supabase Auth...`);
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'SUPER_ADMIN',
        },
      });

      if (createError) {
        throw new Error(`Failed to create auth user: ${createError.message}`);
      }

      userId = newUser.user.id;
    }

    // 2. Ensure profile record is elevated to SUPER_ADMIN with ACTIVE status
    console.log(`🔒 Setting profile record to SUPER_ADMIN with ACTIVE status in PostgreSQL...`);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email: email.toLowerCase(),
        full_name: fullName,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (profileError) {
      throw new Error(`Failed to upsert profile record: ${profileError.message}`);
    }

    console.log(`\n✅ Super Administrator provisioned successfully!`);
    console.log(`   User ID:   ${profile.id}`);
    console.log(`   Role:      ${profile.role}`);
    console.log(`   Status:    ${profile.status}`);
    console.log(`   Email:     ${profile.email}`);
    console.log(`\nYou may now sign in at http://localhost:5173/login with these credentials.\n`);
  } catch (err) {
    console.error(`\n❌ Failed to provision Super Admin:`, err.message);
    process.exit(1);
  }
}

provisionAdmin();

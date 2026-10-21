/**
 * SmartDesk Super Admin Provisioning Script
 * Usage: node scripts/provision_super_admin.js [email] [password] [fullName]
 *
 * Securely provisions a Super Admin account in Supabase Auth and public.profiles
 * with role 'SUPER_ADMIN', status 'ACTIVE', and can_approve_documents = true.
 */

import { supabaseAdmin } from '../src/config/supabase.js';
import { logger } from '../src/utils/logger.js';

async function provisionSuperAdmin() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@smartdesk.college.edu';
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'Admin@SecurePass2026!';
  const fullName = process.argv[4] || process.env.ADMIN_NAME || 'System Administrator';

  if (!supabaseAdmin) {
    logger.error('Supabase admin client is not initialized. Ensure SUPABASE_URL and SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY are set.');
    process.exit(1);
  }

  logger.info(`Starting Super Admin provisioning for ${email}...`);

  try {
    // 1. Create or retrieve auth user in Supabase Auth
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'SUPER_ADMIN',
      },
    });

    let userId = createData?.user?.id;

    if (createError) {
      if (createError.message?.includes('already been registered') || createError.code === 'email_exists') {
        logger.info('User already exists in Supabase Auth. Fetching user ID...');
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;
        const existing = listData.users.find((u) => u.email === email);
        if (!existing) throw new Error(`Could not find existing user record for ${email}`);
        userId = existing.id;
      } else {
        throw createError;
      }
    }

    // 2. Upsert profile with SUPER_ADMIN privileges
    const nowIso = new Date().toISOString();
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name: fullName,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        can_approve_documents: true,
        updated_at: nowIso,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (profileError) {
      throw profileError;
    }

    logger.info(`Super Admin successfully provisioned!`, {
      userId,
      email,
      fullName,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      canApproveDocuments: true,
    });
    console.log(`\n======================================================`);
    console.log(` Super Admin Provisioned Successfully!`);
    console.log(` User ID:  ${userId}`);
    console.log(` Email:    ${email}`);
    console.log(` Role:     SUPER_ADMIN`);
    console.log(` Status:   ACTIVE`);
    console.log(`======================================================\n`);
    process.exit(0);
  } catch (err) {
    logger.error('Failed to provision Super Admin account', { error: err.message });
    console.error('Error provisioning Super Admin:', err.message);
    process.exit(1);
  }
}

provisionSuperAdmin();

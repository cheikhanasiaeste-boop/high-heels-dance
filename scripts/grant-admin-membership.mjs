#!/usr/bin/env node

/**
 * Script to grant admin user a yearly membership starting from today
 * Usage: node scripts/grant-admin-membership.mjs
 */

import mysql from 'mysql2/promise';
import { URL } from 'url';

// Parse DATABASE_URL
const dbUrl = new URL(process.env.DATABASE_URL || 'mysql://root@localhost/high_heels_dance');
const pool = mysql.createPool({
  host: dbUrl.hostname,
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1),
  ssl: {},
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function grantAdminMembership() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Finding admin user...');
    
    // Get admin user
    const [admins] = await connection.query(
      'SELECT id, name, email FROM users WHERE role = ? ORDER BY id LIMIT 1',
      ['admin']
    );
    
    if (admins.length === 0) {
      console.error('❌ No admin user found');
      process.exit(1);
    }
    
    const admin = admins[0];
    console.log(`✅ Found admin: ${admin.name} (${admin.email})`);
    
    // Calculate membership dates
    const now = new Date();
    const endDate = new Date(now);
    endDate.setFullYear(endDate.getFullYear() + 1);
    
    console.log(`\n📅 Granting yearly membership:`);
    console.log(`   Start Date: ${now.toISOString().split('T')[0]}`);
    console.log(`   End Date: ${endDate.toISOString().split('T')[0]}`);
    
    // Update user membership
    const [result] = await connection.query(
      `UPDATE users 
       SET membershipStatus = ?, 
           membershipStartDate = ?, 
           membershipEndDate = ?
       WHERE id = ?`,
      ['annual', now, endDate, admin.id]
    );
    
    if (result.affectedRows > 0) {
      console.log(`\n✅ Successfully granted yearly membership to ${admin.name}`);
      console.log(`   Membership Status: annual`);
      console.log(`   Valid until: ${endDate.toLocaleDateString()}`);
    } else {
      console.error('❌ Failed to update membership');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await connection.release();
    await pool.end();
  }
}

grantAdminMembership();

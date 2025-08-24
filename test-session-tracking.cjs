#!/usr/bin/env node

/**
 * Test Session Tracking Script
 * 
 * Verifies that the new session structure is properly tracking
 * user_id, IP, user_agent, and other audit fields.
 */

const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check sessions with proper tracking
    const sessionsResult = await client.query(`
      SELECT 
        s.id,
        s.user_id,
        s.sid,
        s.ip,
        s.user_agent,
        s.created_at,
        s.last_seen_at,
        s.revoked_at,
        s.revoke_reason,
        u.username,
        u.email
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.revoked_at IS NULL
      ORDER BY s.last_seen_at DESC
      LIMIT 10
    `);
    
    console.log('Active Sessions with User Tracking:');
    console.log('====================================');
    
    if (sessionsResult.rows.length === 0) {
      console.log('No active sessions found');
    } else {
      sessionsResult.rows.forEach((session, index) => {
        console.log(`\n${index + 1}. Session: ${session.sid.substring(0, 20)}...`);
        console.log(`   UUID: ${session.id}`);
        console.log(`   User: ${session.username || 'N/A'} (ID: ${session.user_id || 'N/A'})`);
        console.log(`   Email: ${session.email || 'N/A'}`);
        console.log(`   IP: ${session.ip || 'Not captured'}`);
        console.log(`   User Agent: ${session.user_agent ? session.user_agent.substring(0, 50) + '...' : 'Not captured'}`);
        console.log(`   Created: ${session.created_at}`);
        console.log(`   Last Seen: ${session.last_seen_at}`);
      });
    }

    // Check revoked sessions
    const revokedResult = await client.query(`
      SELECT 
        COUNT(*) as count,
        revoke_reason
      FROM sessions
      WHERE revoked_at IS NOT NULL
      GROUP BY revoke_reason
    `);
    
    console.log('\n\nRevoked Sessions Summary:');
    console.log('========================');
    
    if (revokedResult.rows.length === 0) {
      console.log('No revoked sessions');
    } else {
      revokedResult.rows.forEach(row => {
        console.log(`  ${row.revoke_reason}: ${row.count} sessions`);
      });
    }

    // Check session statistics
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE revoked_at IS NULL) as active_sessions,
        COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) as revoked_sessions,
        COUNT(*) FILTER (WHERE user_id IS NOT NULL) as sessions_with_user,
        COUNT(*) FILTER (WHERE ip IS NOT NULL) as sessions_with_ip,
        COUNT(*) FILTER (WHERE user_agent IS NOT NULL) as sessions_with_agent,
        COUNT(DISTINCT user_id) as unique_users
      FROM sessions
    `);
    
    const stats = statsResult.rows[0];
    console.log('\n\nSession Statistics:');
    console.log('==================');
    console.log(`  Active Sessions: ${stats.active_sessions}`);
    console.log(`  Revoked Sessions: ${stats.revoked_sessions}`);
    console.log(`  Sessions with User ID: ${stats.sessions_with_user}`);
    console.log(`  Sessions with IP: ${stats.sessions_with_ip}`);
    console.log(`  Sessions with User Agent: ${stats.sessions_with_agent}`);
    console.log(`  Unique Users: ${stats.unique_users}`);

    // Check if audit logs can reference sessions
    const auditResult = await client.query(`
      SELECT COUNT(*) as count
      FROM auth_events ae
      WHERE ae.session_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM sessions s 
        WHERE s.id::text = ae.session_id
      )
    `);
    
    console.log('\n\nAudit Integration:');
    console.log('=================');
    console.log(`  Auth events linked to sessions: ${auditResult.rows[0].count}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
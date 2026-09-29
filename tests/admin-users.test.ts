import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth';
import type { Pool } from 'pg';
import * as schema from '../lib/postgres-schema';
import { serializedPool } from '../lib/serialized-pool';
import { changeUser, userCommand } from '../lib/admin/users';
import { listUsers, userDetail, userFilters, dashboard, usersCsv } from '../lib/admin/queries';
import { accountCanSignIn, accountSessionHooks } from '../lib/account-policy';
import { authConfiguration } from '../lib/auth-config';
import { adminBody } from '../lib/admin/body';
import { authorizeAdmin } from '../lib/admin/core';

async function fixture() {
  const db = new PGlite();
  for (const statement of [...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements]) await db.exec(statement);
  const pool = serializedPool({ async query(sql, values) {
    const result = await db.query(sql, values);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.affectedRows ?? result.rows.length };
  } });
  for (const [id,role] of [['owner','owner'],['admin','admin'],['target','user'],['normal','user']]) {
    await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES($1,$1,$2,$3,true)', [id,`${id}@example.test`,role]);
    await pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES($1,$1,$1,0)', [id]);
  }
  const command = (action: string, extra = {}) => userCommand({ action, id: 'target', confirmation: 'target@example.test', reason: 'Regression test', ...extra });
  return { db, pool, command };
}

  for (const input of [{limit:201},{page:0},{q:'x'.repeat(101)},{role:'root'}]) assert.throws(() => userFilters(input));
  for (const body of [{action:'destroy',id:'a',confirmation:'a'}, {action:'ban'id 'a",confirmation:'a',reson:'why'}, {action:'ban'id 'a"}])

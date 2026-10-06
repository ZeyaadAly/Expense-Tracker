import {test} from 'node:test';
import process from 'node:process';
import {verifyT11} from '../scripts/verify-v2-t11-database.mjs';

test('V2 T11 fresh additive migrations, reversal, V1 preservation, money and privileges', {
  skip: !process.env.T11_DISPOSABLE_DATABASE_URL && 'Requires a fresh isolated PostgreSQL cluster on loopback port 55451',
}, async context => { context.diagnostic(JSON.stringify(await verifyT11(process.env.T11_DISPOSABLE_DATABASE_URL))); });

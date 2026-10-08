import {randomBytes} from 'node:crypto';
import {createV2TransactionService} from '../../dist/services/v2-transactions.js';

// Test-only compatibility collector keeps T21–T23 full-set assertions while exercising real bounded queries.
export function createRegressionTransactionService(database) {
  const service=createV2TransactionService(database,{cursorSigningSecret:randomBytes(32).toString('hex')});
  return {...service,async listTransactions(userId,query={}) {
    const rows=[];let cursor;
    do {const page=await service.listTransactions(userId,{...query,limit:100,...(cursor?{cursor}:{})});rows.push(...page.data);cursor=page.meta.nextCursor;}while(cursor);
    return rows;
  }};
}

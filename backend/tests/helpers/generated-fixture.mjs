import { randomUUID } from 'node:crypto';

// Test fixtures obey T32's reserve -> insert -> link -> commit contract.
export async function createGeneratedFixture(client,input,{inTransaction=false}={}) {
  const occurrenceId=input.occurrenceId??randomUUID(),id=input.id??randomUUID();
  if(!inTransaction)await client.query('BEGIN');
  try {
    await client.query("INSERT INTO expense_tracker.recurring_occurrences(id,user_id,recurring_transaction_id,occurrence_date) VALUES($1,$2,$3,$4)",[occurrenceId,input.userId,input.definitionId,input.occurrenceDate]);
    await client.query(`INSERT INTO expense_tracker.transactions(id,user_id,account_id,category_id,type,amount,description,transaction_date,recurring_transaction_id,recurring_occurrence_date,category)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,input.userId,input.accountId,input.categoryId,input.type,input.amount,input.description,input.date,input.definitionId,input.occurrenceDate,input.legacyCategory??null]);
    await client.query("UPDATE expense_tracker.recurring_occurrences SET status='posted',generated_transaction_id=$1,processed_at=statement_timestamp() WHERE id=$2",[id,occurrenceId]);
    if(!inTransaction)await client.query('COMMIT');
    return {id,occurrenceId};
  }catch(error){if(!inTransaction)await client.query('ROLLBACK');throw error;}
}

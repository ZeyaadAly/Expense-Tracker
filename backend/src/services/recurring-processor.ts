import type { Pool, PoolClient } from "pg";
import { getFirstOccurrenceOnOrAfter, getNextOccurrenceAfter, type RecurrenceDefinition } from "../domain/recurrence.js";
import { ApiError, validationError } from "../utils/api-error.js";
import { validateUuid } from "../validators/request.js";
import { createRecurringOccurrenceService, type OccurrenceFailureCode } from "./recurring-occurrences.js";

export interface RecurringProcessingInput {
  referenceDate: string;
  userId?: string;
  definitionId?: string;
  maxPerDefinition?: number;
  maxAttempts?: number;
  /** Caller supplies its deadline/safety-buffer policy. The core never reads a clock. */
  shouldStop?: () => boolean;
}
export interface RecurringProcessingResult {
  definitionsVisited: number; attempts: number; posted: number; skipped: number;
  alreadyTerminal: number; failed: number; conflicts: number; recordedFailures: number;
  failureRecordingErrors: number; limitReached: boolean; deadlineReached: boolean; hasRemaining: boolean;
}
interface Definition extends RecurrenceDefinition {
  id: string; userId: string; status: string; nextOccurrence: string | null;
}
const projection = `id,user_id AS "userId",status,frequency,to_char(start_date,'YYYY-MM-DD') AS "startDate",
  to_char(end_date,'YYYY-MM-DD') AS "endDate",to_char(next_occurrence,'YYYY-MM-DD') AS "nextOccurrence"`;
const eligible = (row:Definition|undefined,reference:string):row is Definition & {nextOccurrence:string} =>
  !!row && row.status === "active" && row.nextOccurrence !== null && row.nextOccurrence <= reference;
const schedule = (row:Definition):RecurrenceDefinition => ({startDate:row.startDate,frequency:row.frequency,endDate:row.endDate});

function validate(input:RecurringProcessingInput) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw validationError([{field:"input",message:"Provide processor options."}]);
  for (const field of Object.keys(input)) if (!["referenceDate","userId","definitionId","maxPerDefinition","maxAttempts","shouldStop"].includes(field)) throw validationError([{field,message:"Unsupported processor option."}]);
  getFirstOccurrenceOnOrAfter({startDate:input.referenceDate,frequency:"daily"},input.referenceDate);
  const userId = input.userId === undefined ? null : validateUuid(input.userId);
  const definitionId = input.definitionId === undefined ? null : validateUuid(input.definitionId);
  const maxPerDefinition = input.maxPerDefinition ?? 100, maxAttempts = input.maxAttempts ?? 1000;
  for (const [field,value,maximum] of [["maxPerDefinition",maxPerDefinition,100],["maxAttempts",maxAttempts,1000]] as const) {
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw validationError([{field,message:`Enter an integer from 1 to ${maximum}.`}]);
  }
  if (input.shouldStop !== undefined && typeof input.shouldStop !== "function") throw validationError([{field:"shouldStop",message:"Provide a deadline predicate."}]);
  return {userId,definitionId,maxPerDefinition,maxAttempts};
}

function failureCode(error:unknown):OccurrenceFailureCode {
  if (error instanceof ApiError && ["ACCOUNT_ARCHIVED","CATEGORY_ARCHIVED","NOT_FOUND","VALIDATION_ERROR"].includes(error.code)) return "INVALID_REFERENCE";
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^(?:08|57P|ECONN|ETIMEDOUT|ENOTFOUND)/.test(code) ? "DATABASE_UNAVAILABLE" : "POSTING_FAILED";
}

/** Internal service only. No HTTP entry, cron, implicit clock or automatic failed-occurrence retry. */
export function createRecurringProcessor(database:Pick<Pool,"query"|"connect">) {
  const ledger = createRecurringOccurrenceService(database);
  async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client = await database.connect(); let discard = false;
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { try { await client.query("ROLLBACK"); } catch { discard = true; } throw error; }
    finally { client.release(discard); }
  }
  async function read(client:PoolClient,userId:string,id:string):Promise<Definition|undefined> {
    return (await client.query<Definition>(`SELECT ${projection} FROM expense_tracker.recurring_transactions WHERE id=$1 AND user_id=$2 FOR UPDATE`,[id,userId])).rows[0];
  }
  async function recordFailure(userId:string,id:string,date:string,code:OccurrenceFailureCode):Promise<boolean> {
    return transaction(async client=>{
      const row = await read(client,userId,id);
      // A lifecycle edit or another committed processor wins over this delayed failure record.
      if (!row || row.status !== "active" || row.nextOccurrence !== date) return false;
      const occurrence = await ledger.getOccurrenceInTransaction(client,userId,id,date);
      if (!occurrence || occurrence.status !== "pending") return false;
      await ledger.transitionOccurrenceInTransaction(client,userId,id,date,"fail",code);
      return true;
    });
  }
  return {
    async processDueRecurring(input:RecurringProcessingInput):Promise<RecurringProcessingResult> {
      const {userId,definitionId,maxPerDefinition,maxAttempts} = validate(input);
      const result:RecurringProcessingResult = {definitionsVisited:0,attempts:0,posted:0,skipped:0,alreadyTerminal:0,failed:0,conflicts:0,recordedFailures:0,failureRecordingErrors:0,limitReached:false,deadlineReached:false,hasRemaining:false};
      const stopped = () => {
        if (input.shouldStop?.()) { result.deadlineReached = true; return true; }
        return false;
      };
      const due = `status='active' AND next_occurrence IS NOT NULL AND next_occurrence <= $1::date
        AND ($2::uuid IS NULL OR user_id=$2) AND ($3::uuid IS NULL OR id=$3)`;
      if (!stopped()) {
        // Every visited definition can consume an attempt; cap the discovery result as well as posting.
        const candidates = await database.query<{id:string;userId:string}>(`SELECT id,user_id AS "userId" FROM expense_tracker.recurring_transactions
          WHERE ${due} ORDER BY next_occurrence ASC,id ASC LIMIT $4`,[input.referenceDate,userId,definitionId,maxAttempts]);
        outer: for (const candidate of candidates.rows) {
          if (result.attempts >= maxAttempts || stopped()) break;
          result.definitionsVisited++;
          for (let perDefinition=0;perDefinition<maxPerDefinition;perDefinition++) {
            if (result.attempts >= maxAttempts || stopped()) break outer;
            let claimedDate:string|undefined, posting=false;
            result.attempts++;
            try {
              const claim = await transaction(async client=>{
                const row = await read(client,candidate.userId,candidate.id);
                if (!eligible(row,input.referenceDate)) return null;
                const date = row.nextOccurrence;
                const occurrence = await ledger.reserveOccurrenceInTransaction(client,row.userId,row.id,date);
                return {date,occurrence};
              });
              if (!claim) break; // Another processor/lifecycle operation has already moved the cursor.
              claimedDate = claim.date;
              if (claim.occurrence.status === "failed") { result.failed++; break; }
              // Deadline can stop after a durable claim; the pending row is safe to resume later.
              if (stopped()) break outer;
              posting = true;
              const handled = await transaction(async client=>{
                // T32 acquires parents before the definition; do not invert that order here.
                const occurrence = await ledger.postOccurrenceInTransaction(client,candidate.userId,candidate.id,claim.date,
                  {referenceDate:input.referenceDate,expectedNextOccurrence:claim.date});
                const row = await read(client,candidate.userId,candidate.id);
                if (!row || row.status !== "active" || row.nextOccurrence !== claim.date) return {occurrence,advanced:false,due:false};
                const terminalDates = await ledger.getReservedDatesInTransaction(client,row.userId,row.id,claim.date,true);
                let next = getNextOccurrenceAfter(schedule(row),claim.date);
                while (next && terminalDates.has(next)) next = getNextOccurrenceAfter(schedule(row),next);
                await client.query("UPDATE expense_tracker.recurring_transactions SET next_occurrence=$3 WHERE id=$1 AND user_id=$2",[row.id,row.userId,next]);
                return {occurrence,advanced:true,due:next !== null && next <= input.referenceDate};
              });
              if (claim.occurrence.status === "posted" || claim.occurrence.status === "skipped" || !handled.advanced) {
                result.alreadyTerminal++;
                if (handled.occurrence.status === "skipped") result.skipped++;
              } else if (handled.occurrence.status === "posted") result.posted++;
              else { result.skipped++; result.alreadyTerminal++; }
              if (!handled.advanced || !handled.due) break;
              if (perDefinition+1 === maxPerDefinition) result.limitReached = true;
            } catch (error) {
              if (error instanceof ApiError && error.code === "CONFLICT") result.conflicts++;
              else {
                result.failed++;
                // Reservation failure/uncertain acknowledgement leaves any committed claim pending.
                if (posting && claimedDate) try {
                  if (await recordFailure(candidate.userId,candidate.id,claimedDate,failureCode(error))) result.recordedFailures++;
                } catch { result.failureRecordingErrors++; }
              }
              break; // Keep the due cursor; try other definitions, never retry this failed attempt inline.
            }
          }
        }
      }
      result.hasRemaining = (await database.query<{remaining:boolean}>(`SELECT EXISTS(SELECT 1 FROM expense_tracker.recurring_transactions WHERE ${due}) AS remaining`,[input.referenceDate,userId,definitionId])).rows[0].remaining;
      if (result.attempts >= maxAttempts && result.hasRemaining) result.limitReached = true;
      return result;
    },
  };
}

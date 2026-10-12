import type {V2TransactionResource,V2TransactionRow} from "../types/v2-transaction.js";
import {formatDecimal} from "./money.js";
import {isCalendarDate} from "../validators/transaction.js";

export function mapV2Transaction(row:V2TransactionRow):V2TransactionResource {
  if(!isCalendarDate(row.date)||(row.recurringOccurrenceDate!==null&&!isCalendarDate(row.recurringOccurrenceDate)))throw new Error("Database dates must be date-only strings");
  return {id:row.id,accountId:row.accountId,accountName:row.accountName,categoryId:row.categoryId,categoryName:row.categoryName,
    type:row.type,amount:formatDecimal(row.amount),currency:"EGP",description:row.description,date:row.date,
    recurringTransactionId:row.recurringTransactionId,recurringOccurrenceDate:row.recurringOccurrenceDate,
    createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
}

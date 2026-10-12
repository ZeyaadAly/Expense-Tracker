import type {TransferResource,TransferRow} from "../types/transfer.js";
import {formatDecimal} from "./money.js";
import {isCalendarDate} from "../validators/transaction.js";

export function mapTransfer(row:TransferRow):TransferResource {
  if(!isCalendarDate(row.date))throw new Error("Database dates must be date-only strings");
  return {id:row.id,sourceAccountId:row.sourceAccountId,sourceAccountName:row.sourceAccountName,
    destinationAccountId:row.destinationAccountId,destinationAccountName:row.destinationAccountName,
    amount:formatDecimal(row.amount),currency:"EGP",date:row.date,description:row.description,
    createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
}

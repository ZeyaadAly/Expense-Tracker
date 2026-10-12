import type { RecurrenceDefinition } from "../domain/recurrence.js";

export type RecurringStatus = "active" | "paused" | "archived";
export interface RecurringInput extends RecurrenceDefinition {
  accountId: string; categoryId: string; type: "income" | "expense";
  amount: string; description: string; endDate: string | null;
}
export interface RecurringResource extends RecurringInput {
  id: string; accountName: string; categoryName: string; currency: "EGP";
  nextOccurrence: string | null; status: RecurringStatus; exhausted: boolean;
  createdAt: string; updatedAt: string;
}
export type RecurringFilters = Partial<Pick<RecurringResource, "status" | "type" | "accountId" | "categoryId" | "frequency">>;

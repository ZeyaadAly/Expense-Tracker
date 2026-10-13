export type GoalStatus = "active" | "completed" | "archived";
export interface GoalInput {
  name: string;
  targetAmount: string;
  savedAmount: string;
  targetDate: string | null;
  linkedAccountId: string | null;
}
export interface GoalUpdate extends GoalInput { status: "active" | "completed" }
export interface GoalResource extends GoalInput {
  id: string;
  remainingAmount: string;
  percentComplete: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

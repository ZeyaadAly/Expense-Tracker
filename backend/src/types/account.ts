export const accountTypes = ["cash", "bank", "savings", "credit_card", "mobile_wallet", "other"] as const;
export type AccountType = typeof accountTypes[number];
export type AccountStatus = "active" | "archived";
export interface AccountInput { name: string; type: AccountType; openingBalance: string }
export interface AccountBalance { id: string; currentBalance: string; currency: "EGP" }
export interface NetPosition { netPosition: string; currency: "EGP" }
export interface AccountResource extends AccountInput, AccountBalance {
  openingBalanceEditable: boolean;
  status: AccountStatus; createdAt: string; updatedAt: string;
}

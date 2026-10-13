export interface BudgetUpdate { amount:string; alertThresholdPercent:number }
export interface BudgetInput extends BudgetUpdate { categoryId:string; year:number; month:number }
export interface BudgetFilters { year:number; month:number; categoryId?:string }
export interface BudgetResource extends BudgetInput {
  id:string; categoryName:string; spent:string; remaining:string; percentUsed:string;
  status:"normal"|"near_limit"|"exceeded"; createdAt:string; updatedAt:string;
}

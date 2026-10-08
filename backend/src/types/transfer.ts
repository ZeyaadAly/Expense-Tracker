export interface TransferInput {
  sourceAccountId:string;
  destinationAccountId:string;
  amount:string;
  date:string;
  description:string|null;
}
export interface TransferListQuery {accountId?:string;from?:string;to?:string;limit?:number;cursor?:string}
export interface TransferResource extends TransferInput {
  id:string;
  sourceAccountName:string;
  destinationAccountName:string;
  currency:"EGP";
  createdAt:string;
  updatedAt:string;
}
export type TransferRow=Omit<TransferResource,"currency"|"createdAt"|"updatedAt"> & {createdAt:Date;updatedAt:Date;cursorCreatedAt?:string};
export interface TransferPage {data:TransferResource[];meta:{limit:number;nextCursor:string|null;hasMore:boolean}}

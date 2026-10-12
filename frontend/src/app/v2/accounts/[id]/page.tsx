import type {Metadata} from "next";
import {AccountDetailPage} from "../../../../features/v2/account-detail-page";
export const metadata:Metadata={title:"Account details · Expense Tracker V2"};
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <AccountDetailPage id={id}/>;
}

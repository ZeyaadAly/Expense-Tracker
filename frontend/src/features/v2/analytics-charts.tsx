import { ChartShell, MoneyDisplay } from "../../components/v2/finance";
import type { AnalyticsCategory, AnalyticsMonth } from "../../lib/api/analytics";
// Plot geometry only: no aggregation or derived financial metrics.
const magnitude=(value:string)=>BigInt(value.replace(".",""));
const absolute=(v:bigint)=>v<BigInt(0)?-v:v;
export function AnalyticsFlow({rows,period}:{rows:AnalyticsMonth[];period:string}){
  const max=rows.reduce((m,r)=>[m,magnitude(r.income),magnitude(r.expenses)].reduce((a,b)=>a>b?a:b),BigInt(1));
  return <ChartShell title="Income vs expenses" period={period} legend={[{label:"Income",tone:"income"},{label:"Expenses",tone:"expense"}]} summary="Posted actuals only. Every month, including zero activity, is listed in the data table below."><div className="t40-chart-scroll" tabIndex={0} role="region" aria-label="Monthly cash flow plot"><div className="p4-bars t40-bars" aria-hidden="true">{rows.map(r=><div className="p4-bar-group" key={r.period}><div className="p4-bar-pair"><i style={{height:`${magnitude(r.income)*BigInt(100)/max}%`}}/><i className="p4-expense-bar" style={{height:`${magnitude(r.expenses)*BigInt(100)/max}%`}}/></div><span>{r.period}</span></div>)}</div></div></ChartShell>;
}
export function AnalyticsSavings({rows,period}:{rows:AnalyticsMonth[];period:string}){
  const max=rows.reduce((m,r)=>{const v=absolute(magnitude(r.netSavings));return v>m?v:m;},BigInt(1));
  const x=(i:number)=>rows.length===1?150:10+i*280/(rows.length-1);
  const y=(r:AnalyticsMonth)=>(BigInt(90)-magnitude(r.netSavings)*BigInt(75)/max).toString();
  return <ChartShell title="Savings trend" period={period} summary="Savings may be negative. Exact monthly values appear in the data table below."><svg className="t40-savings" viewBox="0 0 300 180" aria-hidden="true"><line x1="0" x2="300" y1="90" y2="90" className="t40-zero"/><polyline points={rows.map((r,i)=>`${x(i)},${y(r)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="3"/>{rows.map((r,i)=><circle key={r.period} cx={x(i)} cy={y(r)} r="4"/>)}</svg></ChartShell>;
}
export function AnalyticsCategories({rows,title,period}:{rows:AnalyticsCategory[];title:string;period:string}){
  return <ChartShell title={title} period={period} state={rows.length?"loaded":"empty"} summary={rows.length?"Category totals and shares for this period, including archived history.":"More transaction history is needed for this breakdown."}>{rows.map(r=><div className="p4-category-bar t40-category" key={r.categoryId}><div><strong>{r.categoryName}</strong><span><MoneyDisplay value={r.amount}/> · {r.percentage===null?"Not applicable":`${r.percentage}%`}</span></div><div aria-hidden="true"><i style={{width:r.percentage===null?"0%":`${r.percentage}%`}}/></div></div>)}</ChartShell>;
}

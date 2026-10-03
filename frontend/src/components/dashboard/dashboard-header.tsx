import { Button } from "../ui/button";

export function DashboardHeader({ onAdd }: { onAdd: () => void }) {
  return <header className="flex flex-col gap-4 bg-surface md:flex-row md:flex-wrap md:items-center md:justify-between">
    <div className="min-w-0"><h1 className="text-2xl leading-8 font-semibold md:text-3xl md:leading-9">Expense Tracker</h1><p className="mt-1 text-base leading-6 text-muted">Track your income and expenses in EGP</p></div>
    <Button onClick={onAdd} className="w-full md:w-auto">Add transaction</Button>
  </header>;
}

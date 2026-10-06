"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import * as fixtures from "./fixtures";
function usePrototypeState() {
  const [accounts, setAccounts] = useState(fixtures.accounts);
  const [openingBalances, setOpeningBalances] = useState(
    fixtures.openingBalances,
  );
  const [lockedAccounts, setLockedAccounts] = useState(
    fixtures.accounts.filter((a) => !a.archived).map((a) => a.id),
  );
  const [transactions, setTransactions] = useState(fixtures.transactions);
  const [transfers, setTransfers] = useState(fixtures.transfers);
  const [recurring, setRecurring] = useState(fixtures.recurring);
  const [budgets, setBudgets] = useState(fixtures.budgets);
  const [goals, setGoals] = useState(fixtures.goals);
  const [categories, setCategories] = useState(fixtures.categories);
  const [name, setName] = useState(fixtures.user.displayName);
  const [session, setSession] = useState(true);
  return {
    accounts,
    setAccounts,
    openingBalances,
    setOpeningBalances,
    lockedAccounts,
    setLockedAccounts,
    transactions,
    setTransactions,
    transfers,
    setTransfers,
    recurring,
    setRecurring,
    budgets,
    setBudgets,
    goals,
    setGoals,
    categories,
    setCategories,
    name,
    setName,
    session,
    setSession,
  };
}
const Context = createContext<ReturnType<typeof usePrototypeState> | null>(
  null,
);
export function PrototypeProvider({ children }: { children: ReactNode }) {
  const value = usePrototypeState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePrototype() {
  const value = useContext(Context);
  if (!value) throw new Error("Prototype provider required");
  return value;
}

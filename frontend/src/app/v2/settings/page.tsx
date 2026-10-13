import type { Metadata } from "next";
import { SettingsPage } from "../../../features/v2/settings-page";
export const metadata: Metadata = { title: "settings · Expense Tracker V2" };
export default function Page() { return <SettingsPage />; }

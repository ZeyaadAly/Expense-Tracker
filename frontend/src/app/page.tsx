import { Dashboard } from "@/components/dashboard/dashboard";
import { FixtureDashboard } from "@/components/dashboard/fixture-dashboard";
import { previewScene } from "@/lib/fixtures";
import { redirect } from "next/navigation";

export default async function Home({ searchParams }: { searchParams: Promise<{ preview?: string | string[] }> }) {
  if (process.env.NODE_ENV !== "development") redirect(process.env.V2_APP_ENABLED === "true" ? "/v2/dashboard" : "/v2/login?next=%2Fv2%2Frelease-check");
  // Development-only visual fixtures; this never reads or writes application APIs.
  if (process.env.NODE_ENV === "development") {
    const params = await searchParams;
    if (params.preview !== undefined) {
      const scene = previewScene(params.preview);
      return <FixtureDashboard key={scene} initialScene={scene} />;
    }
  }
  return <Dashboard />;
}

import { Dashboard } from "@/components/dashboard/dashboard";
import { FixtureDashboard } from "@/components/dashboard/fixture-dashboard";
import { previewScene } from "@/lib/fixtures";

export default async function Home({ searchParams }: { searchParams: Promise<{ preview?: string | string[] }> }) {
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

import { Dashboard } from "@/components/dashboard/dashboard";
import { previewScene } from "@/lib/fixtures";

export default async function Home({ searchParams }: { searchParams: Promise<{ preview?: string | string[] }> }) {
  const query = await searchParams;
  // Development-only visual fixtures; this never reads or writes application APIs.
  const scene = process.env.NODE_ENV === "development" ? previewScene(query.preview) : "populated";
  return <Dashboard key={scene} initialScene={scene} />;
}

import { Dashboard } from "@/components/dashboard/dashboard";
import { previewScene } from "@/lib/fixtures";

export default async function Home({ searchParams }: { searchParams: Promise<{ preview?: string | string[] }> }) {
  // Development-only visual fixtures; this never reads or writes application APIs.
  const scene = process.env.NODE_ENV === "development" ? previewScene((await searchParams).preview) : "populated";
  return <Dashboard key={scene} initialScene={scene} />;
}

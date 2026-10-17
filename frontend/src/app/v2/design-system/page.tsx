import { DesignSystemShowcase } from "@/components/v2/dev/showcase";
import { notFound } from "next/navigation";

export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesignSystemShowcase />;
}

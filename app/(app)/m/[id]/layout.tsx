import { memberOrNotFound } from "@/ui/repo";

export default async function MemberLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await memberOrNotFound((await params).id);
  return children;
}

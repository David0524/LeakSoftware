import { ListSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <ListSkeleton title="Jobs" filters={4} search pill />;
}

export function PageSkeleton() {
  return (
    <div aria-label="Loading" aria-busy="true">
      <div className="h-9 w-48 animate-pulse rounded-md bg-surface" />
      <div className="mt-6 h-64 animate-pulse rounded-lg bg-surface" />
    </div>
  );
}

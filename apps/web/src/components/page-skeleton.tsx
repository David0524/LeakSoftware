export function PageSkeleton() {
  return (
    <div aria-label="Loading" aria-busy="true">
      <div className="h-9 w-48 animate-pulse motion-reduce:animate-none rounded-md bg-surface" />
      <div className="mt-6 h-64 animate-pulse motion-reduce:animate-none rounded-lg bg-surface" />
    </div>
  );
}

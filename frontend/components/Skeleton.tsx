export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <Skeleton className="h-1.5 w-8 rounded-full mb-3" />
      <Skeleton className="h-7 w-12 mb-2" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
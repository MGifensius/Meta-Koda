import { Skeleton } from '@buranchi/ui';

export default function AppLoading() {
  return (
    <div className="space-y-section-gap">
      {/* Topbar skeleton */}
      <div className="flex items-start justify-between mb-section-gap">
        <div className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 rounded-tile" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
        <Skeleton className="h-[33px] w-32 rounded-tile" />
      </div>
      {/* Content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-row-gap">
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-32 rounded-card" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-row-gap">
        <Skeleton className="h-64 rounded-card md:col-span-2" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}

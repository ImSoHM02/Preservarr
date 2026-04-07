import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingFallback() {
  return (
    <div className="cmp-loadingfallback__padding-4-space-y-4">
      <div className="cmp-loadingfallback__header-row">
        <Skeleton className="cmp-loadingfallback__height-12-width-12-rounded-full" />
        <div className="cmp-loadingfallback__space-y-2">
          <Skeleton className="cmp-loadingfallback__height-4-width-250px" />
          <Skeleton className="cmp-loadingfallback__height-4-width-200px" />
        </div>
      </div>
      <div className="cmp-loadingfallback__cards-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="cmp-loadingfallback__space-y-3">
            <Skeleton className="cmp-loadingfallback__height-200px-width-full-rounded-xl" />
            <div className="cmp-loadingfallback__space-y-2">
              <Skeleton className="cmp-loadingfallback__height-4-width-3-4" />
              <Skeleton className="cmp-loadingfallback__height-4-width-1-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

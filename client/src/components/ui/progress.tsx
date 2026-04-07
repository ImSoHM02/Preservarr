"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ProgressProps = Omit<React.ComponentPropsWithoutRef<"progress">, "value"> & {
  value?: number;
};

const Progress = React.forwardRef<HTMLProgressElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    const boundedMax = typeof max === "number" && Number.isFinite(max) ? max : 100;
    const boundedValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), boundedMax) : 0;

    return (
      <progress
        ref={ref}
        className={cn("ui-progress__prop-width", className)}
        value={boundedValue}
        max={boundedMax}
        {...props}
      />
    );
  }
);
Progress.displayName = "Progress";

export { Progress };

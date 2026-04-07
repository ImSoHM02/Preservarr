import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    return (
      <input type={type} className={cn("ui-input__field", className)} ref={ref} {...props} />
    );
  }
);
Input.displayName = "Input";

export { Input };

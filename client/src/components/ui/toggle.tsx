import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleVariants = cva("ui-toggle__base", {
  variants: {
    variant: {
      default: "ui-toggle__background-transparent",
      outline: "ui-toggle__variant-outline",
    },
    size: {
      default: "ui-toggle__height-10-min-width-10-padding-x-3",
      sm: "ui-toggle__height-9-min-width-9-padding-x-2-5",
      lg: "ui-toggle__height-11-min-width-11-padding-x-5",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size, className }))}
    {...props}
  />
));

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };

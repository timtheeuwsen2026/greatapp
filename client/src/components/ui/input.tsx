import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onWheel, ...props }, ref) => {
    // Prevent the mouse wheel from silently changing <input type="number"> values.
    // Native browsers increment/decrement a focused number field on scroll, which
    // quietly turned e.g. 40 into 39 when users scrolled to the next step. Blurring
    // on wheel removes focus so scrolling just scrolls the page.
    const handleWheel = React.useCallback(
      (e: React.WheelEvent<HTMLInputElement>) => {
        if (type === "number") {
          (e.target as HTMLInputElement).blur();
        }
        onWheel?.(e);
      },
      [type, onWheel]
    );
    return (
      <input
        type={type}
        onWheel={handleWheel}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

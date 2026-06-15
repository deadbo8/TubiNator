import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "glass-input h-11 w-full rounded-xl px-4 text-sm outline-none placeholder:text-white/40 focus:border-white/40",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary:
        "bg-[hsl(var(--primary))] text-white hover:opacity-90 shadow-lg shadow-[hsl(var(--primary))]/20",
      ghost: "bg-transparent hover:bg-white/10",
      outline: "border border-white/20 bg-transparent hover:bg-white/10",
    };
    const sizes = {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-5",
      lg: "h-12 px-7 text-lg",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

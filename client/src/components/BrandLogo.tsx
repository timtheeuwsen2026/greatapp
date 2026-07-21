import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const BRAND_LOGO_SRC = "/assets/email_logo.png";

interface BrandLogoProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string;
}

export default function BrandLogo({ className, label = "Great", ...props }: BrandLogoProps) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative inline-block aspect-[1.27] shrink-0 overflow-hidden bg-[#9c5df3]", className)}
      {...props}
    >
      <img
        src={BRAND_LOGO_SRC}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute max-w-none"
        style={{ width: "297.4%", height: "166.7%", left: "-98.7%", top: "-33.3%" }}
      />
    </span>
  );
}

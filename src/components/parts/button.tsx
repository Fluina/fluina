import type React from "react";
import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { Ripple, useRipple } from "@/components/effects/ripple";

const buttonVariants = tv({
  base: [
    "overflow-clip relative outline-none cursor-pointer all",
    "focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-fore-1",
    "hover:scale-110",
    "active:scale-90 active:[&>*:not(:first-child)]:scale-75",
  ],
  variants: {
    shape: {
      default: "",
      circle: "size-10 rounded-full flex justify-center items-center",
    },
    color: {
      default: "",
      primary: "bg-blue",
    },
  },
  defaultVariants: {
    shape: "default",
    color: "default",
  },
});

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof buttonVariants> {
  ripple?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      type = "button",
      ripple = true,
      shape,
      color,
      onClick,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const { ripples, triggerRipple } = useRipple();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (ripple) {
        triggerRipple(e);
      }
      onClick?.(e);
    };

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        onClick={handleClick}
        className={buttonVariants({ shape, color, className })}
      >
        {ripple && <Ripple ripples={ripples} />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

import { forwardRef, useRef } from "react";
import {
  Button as RACButton,
  type ButtonProps as RACButtonProps,
  type PressEvent,
} from "react-aria-components";
import { tv, type VariantProps } from "tailwind-variants";
import { Ripple, useRipple } from "@/components/effects/ripple";

const buttonVariants = tv({
  base: [
    "overflow-clip relative outline-none cursor-pointer all",
    "data-hovered:scale-110",
    "data-pressed:scale-90 data-pressed:[&>*:not(:first-child)]:scale-75",
    "data-focus-visible:scale-110 data-focus-visible:ring-2 data-focus-visible:ring-fore-1",
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
  extends Omit<RACButtonProps, "color">,
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
      onPress,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const { ripples, triggerRipple } = useRipple();

    const pointerCoordsRef = useRef<{ clientX: number; clientY: number } | null>(null);

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (ripple) {
        pointerCoordsRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
        };
      }
    };

    const handlePress = (e: PressEvent) => {
      if (ripple) {
        const buttonEl =
          (e.target as HTMLElement)?.closest?.("button") ||
          (e.target as Element);

        if (buttonEl) {
          const coords = pointerCoordsRef.current;
          const isKeyboard = e.pointerType === "keyboard" || e.pointerType === "virtual" || !coords;

          triggerRipple({
            currentTarget: buttonEl,
            clientX: isKeyboard ? undefined : coords.clientX,
            clientY: isKeyboard ? undefined : coords.clientY,
          });
        }
      }

      onPress?.(e);

      pointerCoordsRef.current = null;
    };

    return (
      <RACButton
        {...props}
        ref={ref}
        type={type}
        onPress={handlePress}
        onPointerDown={handlePointerDown}
        className={(renderProps) => {
          const resolvedClassName =
            typeof className === "function" ? className(renderProps) : className;

          return buttonVariants({ shape, color, className: resolvedClassName });
        }}
      >
        {(renderProps) => (
          <>
            {ripple && <Ripple ripples={ripples} />}
            {typeof children === "function" ? children(renderProps) : children}
          </>
        )}
      </RACButton>
    );
  },
);

Button.displayName = "Button";
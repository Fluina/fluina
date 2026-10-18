import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import {
  type PressEvent,
  Button as RACButton,
  type ButtonProps as RACButtonProps,
} from "react-aria-components";
import { tv, type VariantProps } from "tailwind-variants";
import { Ripple, useRipple } from "@/components/effects/ripple";

const buttonVariants = tv({
  base: [
    "overflow-clip relative outline-none cursor-pointer all",
    "data-hovered:scale-[var(--button-hover-scale)] data-pressed:scale-[var(--button-press-scale)] data-pressed:[&>*:not(:first-child)]:scale-[var(--button-content-press-scale)]",
    "data-focus-visible:scale-[var(--button-hover-scale)] data-focus-visible:ring-2 data-focus-visible:ring-fore-1",
  ],
  variants: {
    shape: {
      default: "",
      circle: "size-10 flex justify-center items-center",
    },
    color: {
      default: "",
      primary: "bg-blue",
      caution: "bg-yellow",
    },
  },
  defaultVariants: {
    shape: "default",
    color: "default",
  },
});

const getButtonScales = (size: number) => ({
  hoverScale: Math.min(1.1, 1 + 10 / size),
  pressScale: Math.max(0.9, 1 - 10 / size),
  contentPressScale: Math.max(0.75, 1 - 20 / size),
});

export interface ButtonProps
  extends Omit<RACButtonProps, "color" | "onHoverChange">,
    VariantProps<typeof buttonVariants> {
  ripple?: boolean;
  onHoverChange?: (
    isHovered: boolean,
    button: HTMLButtonElement | null,
    data: {
      width: number;
      height: number;
      hoverScale: number;
    } | null,
  ) => void;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      type = "button",
      ripple = true,
      shape,
      color,
      onPress,
      onHoverChange,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const { ripples, triggerRipple } = useRipple();
    const buttonRef = useRef<HTMLButtonElement>(null);

    useLayoutEffect(() => {
      const button = buttonRef.current;
      if (!button) return;

      const updatePressScale = () => {
        const size = Math.max(button.offsetWidth, button.offsetHeight);
        const { hoverScale, pressScale, contentPressScale } =
          getButtonScales(size);

        button.style.setProperty("--button-hover-scale", String(hoverScale));
        button.style.setProperty("--button-press-scale", String(pressScale));
        button.style.setProperty(
          "--button-content-press-scale",
          String(contentPressScale),
        );
      };

      const observer = new ResizeObserver(updatePressScale);
      observer.observe(button);
      updatePressScale();

      return () => observer.disconnect();
    }, []);

    const setButtonRef = useCallback(
      (button: HTMLButtonElement | null) => {
        buttonRef.current = button;

        if (typeof ref === "function") {
          ref(button);
        } else if (ref) {
          ref.current = button;
        }
      },
      [ref],
    );

    const pointerCoordsRef = useRef<{
      clientX: number;
      clientY: number;
    } | null>(null);

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
          const isKeyboard =
            e.pointerType === "keyboard" ||
            e.pointerType === "virtual" ||
            !coords;

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
        ref={setButtonRef}
        type={type}
        onPress={handlePress}
        onHoverChange={(isHovered) => {
          const button = buttonRef.current;
          const size = button
            ? Math.max(button.offsetWidth, button.offsetHeight)
            : 0;
          onHoverChange?.(
            isHovered,
            button,
            button
              ? {
                  width: button.offsetWidth,
                  height: button.offsetHeight,
                  hoverScale: getButtonScales(size).hoverScale,
                }
              : null,
          );
        }}
        onPointerDown={handlePointerDown}
        className={(renderProps) => {
          const resolvedClassName =
            typeof className === "function"
              ? className(renderProps)
              : className;

          return buttonVariants({ shape, color, className: resolvedClassName });
        }}
      >
        {(renderProps) => (
          <>
            {typeof children === "function" ? children(renderProps) : children}

            {ripple && (
              <Ripple
                ripples={ripples}
                className="pointer-events-none absolute inset-0"
                data-ripple
              />
            )}
          </>
        )}
      </RACButton>
    );
  },
);

Button.displayName = "Button";

import { forwardRef } from "react";
import {
  SwitchButton as RACSwitchButton,
  type SwitchButtonProps as RACSwitchButtonProps,
  SwitchField as RACSwitchField,
  type SwitchFieldProps as RACSwitchFieldProps,
  composeRenderProps,
} from "react-aria-components";
import { cn } from "@/lib/cn";

export interface SwitchProps
  extends Omit<RACSwitchFieldProps, "children" | "className"> {
  className?: RACSwitchButtonProps["className"];
  children?: RACSwitchButtonProps["children"];
}

export const Switch = forwardRef<HTMLLabelElement, SwitchProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <RACSwitchField {...props}>
        <RACSwitchButton
          ref={ref}
          className={composeRenderProps(className, (resolvedClassName) =>
            cn(
              "group inline-flex cursor-pointer items-center gap-2 outline-none",
              "data-disabled:cursor-default data-disabled:opacity-50",
              resolvedClassName,
            ),
          )}
        >
          {composeRenderProps(children, (resolvedChildren, renderProps) => (
            <>
              <span
                className={cn(
                  "all relative inline-flex h-6 w-11 flex-none items-center rounded-full border border-back-5",
                  "group-data-focus-visible:ring-2 group-data-focus-visible:ring-fore-1 group-data-focus-visible:ring-offset-2 group-data-focus-visible:ring-offset-back-1",
                  renderProps.isSelected ? "bg-blue" : "bg-back-3",
                )}
              >
                <span
                  className={cn(
                    "all absolute size-4.5 rounded-full bg-back-0_ shadow",
                    renderProps.isSelected
                      ? "translate-x-5.5"
                      : "translate-x-0.5",
                    renderProps.isPressed && "w-5",
                  )}
                />
              </span>

              {resolvedChildren}
            </>
          ))}
        </RACSwitchButton>
      </RACSwitchField>
    );
  },
);

Switch.displayName = "Switch";
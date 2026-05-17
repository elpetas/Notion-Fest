import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 3D press button — black face, dark-gray depth block below.
 * Rest → hover shifts face down 3px (depth shrinks) → active fully pressed (flush).
 */
const extruded = [
  "rounded-xl bg-neutral-900 text-white font-semibold border-0",
  "shadow-[0_5px_0_0_#3d3d3d]",
  "transition-[transform,box-shadow] duration-100 ease-out",
  "hover:translate-y-[3px] hover:shadow-[0_2px_0_0_#3d3d3d]",
  "active:translate-y-[5px] active:shadow-none",
  "disabled:hover:translate-y-0 disabled:hover:shadow-[0_5px_0_0_#3d3d3d]",
  "disabled:active:translate-y-0 disabled:active:shadow-[0_5px_0_0_#3d3d3d]",
].join(" ");

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center bg-clip-padding whitespace-nowrap outline-none select-none",
    "disabled:pointer-events-none disabled:opacity-45",
    "focus-visible:ring-2 focus-visible:ring-neutral-900/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: extruded,
        outline: extruded,
        secondary: extruded,
        ghost: extruded,
        destructive: [extruded, "bg-destructive shadow-[0_5px_0_0_#a83030]",
          "hover:shadow-[0_2px_0_0_#a83030]",
          "disabled:hover:shadow-[0_5px_0_0_#a83030]",
          "disabled:active:shadow-[0_5px_0_0_#a83030]",
        ].join(" "),
        link: [
          "rounded-md border-0 bg-transparent font-medium text-primary underline-offset-4",
          "shadow-none transition-colors hover:underline",
          "hover:translate-y-0 active:translate-y-0",
          "!min-h-0 px-0 py-1",
        ].join(" "),
      },
      size: {
        default: "h-10 gap-1.5 px-4 text-sm",
        xs: "h-8 gap-1 rounded-lg px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1 rounded-lg px-3.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 text-base",
        icon: "size-11 rounded-xl [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-lg",
        "icon-lg": "size-11 rounded-xl [&_svg:not([class*='size-'])]:size-5",
      },
    },
    compoundVariants: [
      {
        variant: "link",
        class: "!h-auto",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };

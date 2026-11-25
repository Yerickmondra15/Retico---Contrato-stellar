import type { ComponentPropsWithoutRef } from "react";

// Adaptación del Slide Text Button de Kokonut UI. Ver KOKONUT-LICENSE.
// https://github.com/kokonut-labs/kokonutui/blob/main/components/kokonutui/slide-text-button.tsx
type Props = ComponentPropsWithoutRef<"button"> & { label: string };

export function SlideTextButton({ label, className = "", ...props }: Props) {
  return (
    <button className={`slide-button ${className}`} {...props}>
      <span className="slide-labels">
        <span>{label}</span>
        <span aria-hidden="true">{label}</span>
      </span>
    </button>
  );
}

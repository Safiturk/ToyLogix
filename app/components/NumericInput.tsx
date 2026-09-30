"use client";

import type { InputHTMLAttributes } from "react";

// Native min/step validate submission; these guards also cover typing and paste.
export default function NumericInput({ onChange, onKeyDown, onPaste, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="number"
    onKeyDown={(event) => {
      if (["-", "+", "e", "E"].includes(event.key)) event.preventDefault();
      onKeyDown?.(event);
    }}
    onPaste={(event) => {
      const value = event.clipboardData.getData("text").trim();
      if (!/^\d*([.,]\d*)?$/.test(value)) event.preventDefault();
      onPaste?.(event);
    }}
    onChange={(event) => {
      const { value, valueAsNumber } = event.currentTarget;
      if (value !== "" && (!Number.isFinite(valueAsNumber) || valueAsNumber < 0 ||
          (String(props.step) === "1" && !Number.isSafeInteger(valueAsNumber)))) return;
      onChange?.(event);
    }}
  />;
}

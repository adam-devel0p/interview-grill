import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-indigo-400";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-indigo-500 text-white hover:bg-indigo-400",
  secondary: "border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700",
};

export default function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}

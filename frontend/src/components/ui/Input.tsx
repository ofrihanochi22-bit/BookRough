import { forwardRef } from "react";
import { cn } from "../../lib/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className, ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-gray-700"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors",
            "placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500",
            error
              ? "border-red-400 focus:ring-red-400"
              : "border-gray-300 focus:border-indigo-500",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

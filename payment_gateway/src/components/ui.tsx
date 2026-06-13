import React from 'react';
import { Loader2 } from 'lucide-react';

// ==========================================
// BUTTON COMPONENT
// ==========================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  isLoading?: boolean;
}

// Custom reusable button component. Supports loading states and variants.
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', isLoading, children, disabled, ...props }, ref) => {
    const baseStyle = 'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:pointer-events-none cursor-pointer';
    
    // Tailwind classes mapping to styles
    const variants = {
      primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
      secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50',
      danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
      success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
      ghost: 'hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyle} ${variants[variant]} ${className}`}
        {...props}
      >
        {/* Render a spinner indicator if button is in loading state */}
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin text-current" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

// ==========================================
// INPUT COMPONENT
// ==========================================
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

// Custom input box with support for warning labels and error states.
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, type = 'text', ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</label>}
        <input
          ref={ref}
          type={type}
          className={`w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${
            error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
          } ${className}`}
          {...props}
        />
        {error && <p className="text-xs font-medium text-red-400">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ==========================================
// SELECT COMPONENT
// ==========================================
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

// Custom select dropdown component
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, options, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</label>}
        <select
          ref={ref}
          className={`w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3.5 py-2 text-sm text-zinc-100 shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer ${
            error ? 'border-red-500 focus:ring-red-500' : ''
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-zinc-900">
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs font-medium text-red-400">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

// ==========================================
// CARD COMPONENTS
// ==========================================
export const Card = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`rounded-xl border border-zinc-900 bg-zinc-950/70 p-6 shadow-md backdrop-blur-md ${className}`} {...props} />
);

export const CardHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col gap-1.5 pb-4 ${className}`} {...props} />
);

export const CardTitle = ({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`text-lg font-bold text-zinc-100 tracking-tight ${className}`} {...props} />
);

export const CardDescription = ({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-zinc-500 ${className}`} {...props} />
);

export const CardContent = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`pt-2 ${className}`} {...props} />
);

export const CardFooter = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex items-center pt-4 border-t border-zinc-900/50 mt-4 ${className}`} {...props} />
);

// ==========================================
// TABLE COMPONENTS
// ==========================================
export const Table = ({ className = '', ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto rounded-lg border border-zinc-900">
    <table className={`w-full text-left text-sm border-collapse ${className}`} {...props} />
  </div>
);

export const TableHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={`bg-zinc-900/50 border-b border-zinc-900 text-xs font-semibold text-zinc-400 uppercase tracking-wider ${className}`} {...props} />
);

export const TableBody = ({ className = '', ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={`divide-y divide-zinc-900 bg-zinc-950/20 ${className}`} {...props} />
);

export const TableHead = ({ className = '', ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
  <th className={`px-4 py-3.5 font-medium ${className}`} {...props} />
);

export const TableRow = ({ className = '', ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={`transition-colors hover:bg-zinc-900/20 ${className}`} {...props} />
);

export const TableCell = ({ className = '', ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
  <td className={`px-4 py-3.5 text-zinc-300 align-middle ${className}`} {...props} />
);

// ==========================================
// BADGE COMPONENT
// ==========================================
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

// Small colored status pill (e.g. used for transaction success/failure states)
export const Badge = ({ className = '', variant = 'neutral', ...props }: BadgeProps) => {
  const styles = {
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
    info: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
    neutral: 'bg-zinc-800 text-zinc-400 border border-zinc-700/50',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${styles[variant]} ${className}`}
      {...props}
    />
  );
};

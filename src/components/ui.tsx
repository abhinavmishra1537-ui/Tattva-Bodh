import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

/* ---------------- Button ---------------- */
type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-ink-900 text-cream hover:bg-ink-800 active:bg-ink-950 border border-ink-900 shadow-sm",
  accent:
    "bg-brass-600 text-cream hover:bg-brass-700 active:bg-brass-700 border border-brass-700 shadow-sm",
  outline:
    "bg-transparent text-ink-800 border border-line-strong hover:border-ink-500 hover:bg-cream",
  ghost: "bg-transparent text-ink-600 border border-transparent hover:bg-ink-100/60 hover:text-ink-800",
  danger:
    "bg-alert-600 text-cream hover:bg-alert-700 border border-alert-700 shadow-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-[-0.005em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2.5 text-[13.5px]",
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
}

/* ---------------- Form fields ---------------- */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-caps mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-400">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-md border border-line-strong bg-white/70 px-3.5 py-2.5 text-[14px] text-ink-900 placeholder:text-ink-300 transition-colors duration-150 focus:border-ink-600 focus:bg-white disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputBase, className)} {...props} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputBase, "min-h-[110px] resize-y", className)} {...props} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(inputBase, "appearance-none pr-9 bg-[length:14px] bg-[right_12px_center] bg-no-repeat", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23606a8e' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...props} />;
  }
);

/* ---------------- Badge ---------------- */
type BadgeTone = "ink" | "brass" | "pine" | "alert" | "outline";

const badgeTones: Record<BadgeTone, string> = {
  ink: "bg-ink-100 text-ink-700 border-ink-200",
  brass: "bg-brass-100 text-brass-700 border-brass-200",
  pine: "bg-pine-100 text-pine-700 border-pine-100",
  alert: "bg-alert-100 text-alert-700 border-alert-100",
  outline: "bg-transparent text-ink-500 border-line-strong",
};

export function Badge({
  tone = "ink",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Spinner & page loading ---------------- */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700",
        className
      )}
    />
  );
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-ink-400">
      <Spinner className="h-5 w-5" />
      <p className="text-[13px] font-medium tracking-wide">{label}…</p>
    </div>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-cream/60 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <h3 className="font-display text-[17px] font-semibold text-ink-800">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-400">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- Page header ---------------- */
export function PageHeader({
  kicker,
  title,
  sub,
  actions,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <p className="label-caps mb-2 text-brass-600">{kicker}</p>}
        <h1 className="font-display text-[27px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
          {title}
        </h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-400">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/45 p-4 backdrop-blur-[2px] animate-fade sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "w-full rounded-lg border border-line bg-cream shadow-pop animate-rise",
          width
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[16.5px] font-semibold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100/70 hover:text-ink-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Stat tile ---------------- */
export function StatTile({
  label,
  value,
  foot,
  icon,
}: {
  label: string;
  value: ReactNode;
  foot?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="surface px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="label-caps">{label}</p>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-[26px] font-semibold leading-none text-ink-900">{value}</p>
      {foot && <p className="mt-1.5 text-[12px] text-ink-400">{foot}</p>}
    </div>
  );
}

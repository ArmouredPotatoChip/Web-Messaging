import type { AppError } from "./lib/errors";

const STYLES = {
  box: {
    root: "rounded border border-red-200 bg-red-50 p-3 text-sm",
    context: "font-medium text-red-700",
    cause: "text-red-600",
    retry: "mt-2 text-red-700 underline disabled:opacity-50",
  },
  inline: {
    root: "text-red-600",
    context: "font-medium",
    cause: undefined,
    retry: "underline disabled:opacity-50",
  },
};

type Props = {
  variant: keyof typeof STYLES;
  context: string;
  error: AppError;
  onRetry: () => void;
  busy?: boolean;
  className?: string;
};

export function ErrorNotice({ variant, context, error, onRetry, busy, className }: Props) {
  const styles = STYLES[variant];

  return (
    <div className={className ? `${styles.root} ${className}` : styles.root}>
      <p className={styles.context}>{context}</p>
      <p className={styles.cause}>{error.message}</p>
      {error.retryable && (
        <button type="button" onClick={onRetry} disabled={busy} className={styles.retry}>
          Try again
        </button>
      )}
    </div>
  );
}

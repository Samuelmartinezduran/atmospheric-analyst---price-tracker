import {useId, useState, type ComponentProps, type ReactNode} from 'react';
import {AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2, type LucideIcon} from 'lucide-react';
import {cn} from '../lib/utils';

// --- Botones -----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'primary-gradient text-white shadow-md hover:shadow-lg hover:shadow-primary/25',
  secondary:
    'bg-surface-container-lowest text-on-surface border border-outline-variant/40 hover:bg-surface-container-high',
  tonal: 'bg-primary/10 text-primary hover:bg-primary/15',
  danger: 'bg-error text-on-error hover:bg-error/90',
  ghost: 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
};

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconSize = size === 'sm' ? 15 : 18;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        size === 'sm' && 'h-9 px-3 text-xs',
        size === 'md' && 'h-11 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-sm',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon size={iconSize} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

// --- Campos ------------------------------------------------------------------

const INPUT_CLASSES =
  'w-full h-12 px-4 rounded-xl border border-transparent bg-surface-container-highest text-sm font-medium text-on-surface placeholder:text-on-surface-variant/60 transition-colors focus:bg-surface-container-lowest focus:border-primary/50 aria-[invalid=true]:border-error/60';

export const LABEL_CLASSES = 'mb-2 ml-1 block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'size'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Para ocultar la etiqueta a la vista sin quitársela a los lectores de pantalla. */
  hideLabel?: boolean;
  trailing?: ReactNode;
}

export function TextField({label, hint, error, hideLabel, trailing, id, className, ...inputProps}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : LABEL_CLASSES}>
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={cn(INPUT_CLASSES, trailing && 'pr-12')}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 ml-1 text-xs text-on-surface-variant">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 ml-1 text-xs font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      }
    />
  );
}

// --- Mensajes ----------------------------------------------------------------

type MessageKind = 'error' | 'info' | 'success';

const MESSAGE_CLASSES: Record<MessageKind, string> = {
  error: 'border-error/25 bg-error/8 text-error',
  info: 'border-primary/20 bg-primary/5 text-on-surface',
  success: 'border-emerald-600/25 bg-emerald-600/8 text-emerald-800 dark:text-emerald-300',
};

const MESSAGE_ICONS: Record<MessageKind, LucideIcon> = {
  error: AlertCircle,
  info: Info,
  success: CheckCircle2,
};

export function Message({kind, children, className}: {kind: MessageKind; children: ReactNode; className?: string}) {
  const Icon = MESSAGE_ICONS[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm font-medium', MESSAGE_CLASSES[kind], className)}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={cn('mt-0.5 shrink-0', kind === 'info' && 'text-primary')}
      />
      <div className="min-w-0 flex-1 space-y-2 leading-snug">{children}</div>
    </div>
  );
}

/** Cuadro para los tokens que el backend devuelve en desarrollo (`debug_token`). */
export function DevTokenNotice({token, children}: {token: string; children?: ReactNode}) {
  return (
    <div className="rounded-xl border border-dashed border-tertiary-container/60 bg-tertiary-container/10 px-4 py-3 text-sm">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
        Modo desarrollo · sin email
      </p>
      <p className="mb-2 break-all font-mono text-xs text-on-surface">{token}</p>
      {children}
    </div>
  );
}

// --- Varios ------------------------------------------------------------------

export function Spinner({label, className}: {label: string; className?: string}) {
  return (
    <div role="status" className={cn('flex items-center gap-3 text-sm font-semibold text-on-surface-variant', className)}>
      <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-surface-container-lowest px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Icon size={30} className="text-primary" aria-hidden="true" />
      </div>
      <div className="max-w-sm">
        <p className="mb-1 font-manrope text-lg font-extrabold text-on-surface">{title}</p>
        {children && <div className="text-sm font-medium text-on-surface-variant">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({title, description, actions}: {title: string; description?: string; actions?: ReactNode}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:mb-10">
      <div className="min-w-0">
        <h1 className="mb-1 font-manrope text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl">{title}</h1>
        {description && <p className="font-medium text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

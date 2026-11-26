import {useId, type InputHTMLAttributes, type ReactNode} from 'react';
import {Dot} from './ui';

export const MIN_PASSWORD = 12;

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
  labelAside?: ReactNode;
}

/** Campo con su etiqueta asociada, una pista opcional y su error (aria-describedby). */
export function Field({label, hint, error, trailing, labelAside, className, ...input}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = (
    <input
      id={id}
      className={`input ${className ?? ''}`}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
      {...input}
    />
  );
  return (
    <div className="field">
      {labelAside ? (
        <div className="split">
          <label htmlFor={id}>{label}</label>
          {labelAside}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      {trailing ? (
        <div className="input-affix">
          {control}
          <span aria-hidden="true">{trailing}</span>
        </div>
      ) : (
        control
      )}
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="hint" id={errorId} style={{color: 'var(--fg)', display: 'flex', gap: 6, alignItems: 'center'}}>
          <Dot tone="err" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Notice({tone, children, live = true}: {tone: 'ok' | 'err' | ''; children: ReactNode; live?: boolean}) {
  return (
    <div className={`notice ${tone}`} role={live ? (tone === 'err' ? 'alert' : 'status') : undefined}>
      <Dot tone={tone} />
      <div className="grow">{children}</div>
    </div>
  );
}

/** En desarrollo (`AUTH_ENABLE_DEBUG_TOKENS`), el backend devuelve el token del email. */
export function DebugToken({token, href, label}: {token: string; href: string; label: string}) {
  return (
    <Notice tone="">
      <p>Modo de desarrollo: este es el token que iría en el email.</p>
      <code>{token}</code>
      <div>
        <a className="btn sec sm" href={href}>
          {label}
        </a>
      </div>
    </Notice>
  );
}

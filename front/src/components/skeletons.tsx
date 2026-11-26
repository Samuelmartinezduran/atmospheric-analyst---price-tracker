/**
 * Esqueletos de carga. Astro los pinta en el HTML estático (sin JavaScript) mientras llega la
 * isla, y las islas los reutilizan mientras comprueban la sesión: así no hay saltos.
 */
import type {ReactNode} from 'react';
import {Topbar} from './ui';

export type SkeletonVariant = 'dash' | 'detail' | 'table' | 'settings';

function Lines({count, widths = ['70%', '45%', '60%']}: {count: number; widths?: string[]}) {
  return (
    <>
      {Array.from({length: count}, (_, i) => (
        <span key={i} className="sk line" style={{width: widths[i % widths.length]}} />
      ))}
    </>
  );
}

export function SkeletonBody({variant}: {variant: SkeletonVariant}) {
  if (variant === 'dash') {
    return (
      <div className="dash">
        <aside className="stack">
          <span className="sk panel" />
          <span className="sk panel" style={{height: 120}} />
          <span className="sk panel" style={{height: 240}} />
        </aside>
        <div>
          <div className="toolbar">
            <span className="sk" style={{height: 40, flex: 1, borderRadius: 6}} />
            <span className="sk" style={{height: 40, width: 78, borderRadius: 6}} />
            <span className="sk" style={{height: 40, width: 90, borderRadius: 6}} />
          </div>
          <div className="cards">
            {Array.from({length: 6}, (_, i) => (
              <span key={i} className="sk card" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (variant === 'detail') {
    return (
      <div className="stack">
        <div style={{display: 'grid', gap: 10, maxWidth: 520}}>
          <Lines count={2} widths={['90%', '40%']} />
        </div>
        <span className="sk" style={{height: 84, borderRadius: 8}} />
        <span className="sk block" />
        <span className="sk panel" />
      </div>
    );
  }
  if (variant === 'settings') {
    return (
      <div className="stack">
        <span className="sk panel" style={{height: 120}} />
        <span className="sk panel" style={{height: 260}} />
        <span className="sk panel" />
      </div>
    );
  }
  return (
    <div className="stack">
      <span className="sk" style={{height: 34, width: 280, borderRadius: 6}} />
      <div className="panel" style={{padding: 14, display: 'grid', gap: 16}}>
        <Lines count={8} widths={['80%', '65%', '72%', '55%']} />
      </div>
    </div>
  );
}

export function PageSkeleton({
  crumb,
  title,
  variant,
  narrow,
}: {
  crumb: ReactNode;
  title: string;
  variant: SkeletonVariant;
  narrow?: boolean;
}) {
  return (
    <>
      <Topbar crumb={crumb} title={title} />
      <div className={`content${narrow ? ' narrow' : ''}`} role="status" aria-live="polite">
        <span className="sr-only">Cargando…</span>
        <SkeletonBody variant={variant} />
      </div>
    </>
  );
}

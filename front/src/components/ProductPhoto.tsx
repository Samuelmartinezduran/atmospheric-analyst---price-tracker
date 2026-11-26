/**
 * Foto del producto (de la tienda) con un dibujo de respaldo por categoría si no hay o falla.
 * Carga diferida, sin enviar la página de origen y con medidas para que nada salte.
 */
import {useState} from 'react';
import {productCategory, safeExternalUrl, type Category} from '../lib/productStatus';

function Art({category, className}: {category: Category; className?: string}) {
  const common = {
    className: `ph ${className ?? ''}`,
    viewBox: '0 0 160 100',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    preserveAspectRatio: 'xMidYMid meet',
  };
  if (category === 'gpu') {
    return (
      <svg {...common}>
        <rect x="18" y="26" width="124" height="44" rx="6" />
        <circle cx="56" cy="48" r="14" />
        <circle cx="104" cy="48" r="14" />
        <path d="M56 38v20M46 48h20M104 38v20M94 48h20" opacity=".55" />
        <path d="M30 70v8h40v-8" />
      </svg>
    );
  }
  if (category === 'phone') {
    return (
      <svg {...common}>
        <rect x="62" y="10" width="36" height="80" rx="8" />
        <path d="M74 16h12" />
        <rect x="68" y="22" width="24" height="56" rx="2" opacity=".45" />
      </svg>
    );
  }
  if (category === 'ram') {
    return (
      <svg {...common}>
        <rect x="14" y="34" width="132" height="28" rx="3" />
        {[30, 52, 74, 96, 118].map((x) => (
          <rect key={x} x={x} y="40" width="14" height="14" rx="1.5" opacity=".6" />
        ))}
        <path d="M22 62v6M38 62v6M54 62v6M70 62v6M90 62v6M106 62v6M122 62v6M138 62v6" opacity=".55" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M44 34 80 18l36 16v36L80 86 44 70z" />
      <path d="M44 34l36 16 36-16M80 50v36" opacity=".55" />
    </svg>
  );
}

interface Props {
  src: string | null | undefined;
  title: string | null | undefined;
  /** Medidas intrínsecas (proporción) para reservar el hueco. */
  width: number;
  height: number;
  className?: string;
  eager?: boolean;
}

export function ProductPhoto({src, title, width, height, className, eager}: Props) {
  const [failed, setFailed] = useState(false);
  const url = safeExternalUrl(src);
  if (!url || failed) return <Art category={productCategory(title)} className={className} />;
  return (
    <img
      className={className}
      src={url}
      alt=""
      width={width}
      height={height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

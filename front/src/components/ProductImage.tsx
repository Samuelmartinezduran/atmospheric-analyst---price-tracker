import {useState} from 'react';
import placeholderUrl from '../assets/product-placeholder.svg';
import {cn} from '../lib/utils';

interface ProductImageProps {
  src: string | null;
  /** Texto alternativo; vacío si la imagen es decorativa (el nombre ya está al lado). */
  alt?: string;
  className?: string;
  muted?: boolean;
}

/** Imagen del producto con un dibujo local de respaldo si no hay imagen o no carga. */
export function ProductImage({src, alt = '', className, muted}: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = src && src !== failedSrc ? src : null;
  return (
    <img
      src={usable ?? placeholderUrl}
      alt={usable ? alt : ''}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={cn(
        'h-full w-full object-contain',
        !usable && 'p-[12%] opacity-80',
        muted && 'opacity-50 grayscale',
        className,
      )}
    />
  );
}

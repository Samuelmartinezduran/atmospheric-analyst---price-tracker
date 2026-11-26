// Iconos SVG propios (16 × 16, trazo de 1,4). Decorativos: siempre aria-hidden.
import type {ReactNode, SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function icon(paths: ReactNode) {
  return function Icon(props: IconProps) {
    return (
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const IconGrid = icon(
  <>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </>,
);

export const IconRows = icon(
  <>
    <path d="M2 4h12M2 8h12M2 12h12" />
  </>,
);

export const IconPulse = icon(<path d="M1.5 8h3l2-5 3 10 2-5h3" />);

export const IconBell = icon(
  <>
    <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3z" />
    <path d="M6.5 14h3" />
  </>,
);

export const IconCog = icon(
  <>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </>,
);

export const IconShield = icon(<path d="M8 1.5 13 3.5v4c0 3-2.2 5.3-5 6.5-2.8-1.2-5-3.5-5-6.5v-4z" />);

export const IconSearch = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3.5 3.5" />
  </>,
);

export const IconPlus = icon(<path d="M8 3v10M3 8h10" />);

export const IconRefresh = icon(
  <>
    <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1" />
    <path d="M13.5 2v3h-3" />
  </>,
);

export const IconExternal = icon(
  <>
    <path d="M9.5 2.5h4v4" />
    <path d="M13.5 2.5 7.5 8.5" />
    <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
  </>,
);

export const IconPencil = icon(
  <>
    <path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5v-3z" />
    <path d="M9 4l3 3" />
  </>,
);

export const IconTrash = icon(
  <>
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
  </>,
);

export const IconMore = icon(
  <>
    <circle cx="3.5" cy="8" r=".6" fill="currentColor" />
    <circle cx="8" cy="8" r=".6" fill="currentColor" />
    <circle cx="12.5" cy="8" r=".6" fill="currentColor" />
  </>,
);

export const IconMenu = icon(<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />);

export const IconClose = icon(<path d="M4 4l8 8M12 4l-8 8" />);

export const IconLogout = icon(
  <>
    <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" />
    <path d="M10.5 11 13.5 8l-3-3M13.5 8H6" />
  </>,
);

export const IconHelp = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.3 6.2a1.8 1.8 0 0 1 3.4.8c0 1.2-1.7 1.4-1.7 2.5" />
    <circle cx="8" cy="11.6" r=".4" fill="currentColor" />
  </>,
);

export const IconTarget = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="3" />
    <circle cx="8" cy="8" r=".6" fill="currentColor" />
  </>,
);

export const IconArrowLeft = icon(<path d="M13 8H3M7 4 3 8l4 4" />);

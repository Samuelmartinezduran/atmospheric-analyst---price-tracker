import type {ElementType} from 'react';
import {Bell, Pencil, PlusCircle, RefreshCw} from 'lucide-react';
import {Modal} from './Modal';
import {Button} from './ui';

const STEPS: {icon: ElementType; title: string; body: string}[] = [
  {
    icon: PlusCircle,
    title: 'Añadir un producto',
    body: 'En el panel, pega la URL de un producto de una tienda compatible y fija el precio objetivo. Al guardarlo se comprueba el precio por primera vez.',
  },
  {
    icon: RefreshCw,
    title: 'Comprobar precios',
    body: 'Los precios se comprueban solos cada cierto tiempo. Si no quieres esperar, usa «Comprobar todos» en el panel o «Comprobar ahora» en el detalle de un producto.',
  },
  {
    icon: Bell,
    title: 'Recibir alertas',
    body: 'Cuando el precio baja de tu objetivo te llega un email. Todas las alertas, enviadas o no, quedan en «Alertas».',
  },
  {
    icon: Pencil,
    title: 'Cambiar el objetivo',
    body: 'Abre un producto y pulsa «Editar objetivo». Si el precio ya está por debajo, lo verás marcado en el panel, pero no se manda un email por ello.',
  },
];

export function HelpModal({open, onClose, storeNames}: {open: boolean; onClose: () => void; storeNames: string[]}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cómo funciona"
      footer={<Button onClick={onClose}>Entendido</Button>}
    >
      <ol className="space-y-5">
        {STEPS.map(({icon: Icon, title, body}) => (
          <li key={title} className="flex gap-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Icon size={16} className="text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="mb-0.5 text-sm font-bold text-on-surface">{title}</p>
              <p className="text-sm leading-relaxed text-on-surface-variant">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-on-surface-variant">
        Tiendas compatibles:{' '}
        <span className="font-bold text-on-surface">
          {storeNames.length > 0 ? storeNames.join(', ') : 'Amazon ES, PCComponentes'}
        </span>
      </p>
    </Modal>
  );
}

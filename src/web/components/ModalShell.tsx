import type { ReactNode } from 'react';
import s from './ModalShell.module.css';

interface ModalShellProps {
  closing?: boolean;
  children: ReactNode;
  className?: string;
  onClose: () => void;
}

export function ModalShell({ closing = false, children, className = '', onClose }: ModalShellProps) {
  return (
    <div className={`${s.overlay} ${closing ? s.overlayClosing : ''}`} onClick={onClose}>
      <div
        className={`${s.modal} ${className} ${closing ? s.modalClosing : ''}`}
        onClick={event => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

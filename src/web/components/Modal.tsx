import { useEffect } from 'react';
import s from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDanger?: boolean;
}

export function Modal({
  open,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  confirmDanger = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const isConfirm = typeof onConfirm === 'function';

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.title}>{title}</div>
        <div className={s.message}>{message}</div>
        <div className={s.buttons}>
          {isConfirm ? (
            <>
              <button className="btn btnGhost btnSm" onClick={onClose}>Cancel</button>
              <button
                className={`btn btnSm ${confirmDanger ? 'btnDanger' : 'btnPrimary'}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button className="btn btnPrimary btnSm" onClick={onClose}>OK</button>
          )}
        </div>
      </div>
    </div>
  );
}

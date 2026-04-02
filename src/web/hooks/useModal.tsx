import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Modal } from '../components/Modal';

interface ConfirmOpts {
  label?: string;
  danger?: boolean;
}

interface ModalContextValue {
  alert: (title: string, message: string) => Promise<void>;
  confirm: (title: string, message: string, opts?: ConfirmOpts) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextValue | null>(null);

interface ModalState {
  title: string;
  message: string;
  type: 'alert' | 'confirm';
  confirmLabel?: string;
  confirmDanger?: boolean;
}

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const resolveRef = useRef<((value: any) => void) | null>(null);

  const close = useCallback((result: any) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setModal(null);
  }, []);

  const alert = useCallback((title: string, message: string): Promise<void> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ title, message, type: 'alert' });
    });
  }, []);

  const confirm = useCallback((title: string, message: string, opts?: ConfirmOpts): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({
        title,
        message,
        type: 'confirm',
        confirmLabel: opts?.label,
        confirmDanger: opts?.danger,
      });
    });
  }, []);

  return (
    <ModalContext.Provider value={{ alert, confirm }}>
      {children}
      <Modal
        open={modal !== null}
        title={modal?.title || ''}
        message={modal?.message || ''}
        onClose={() => close(modal?.type === 'confirm' ? false : undefined)}
        onConfirm={modal?.type === 'confirm' ? () => close(true) : undefined}
        confirmLabel={modal?.confirmLabel}
        confirmDanger={modal?.confirmDanger}
      />
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}

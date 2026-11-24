import { Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

type ConfirmDeleteDialogProps = {
  itemType: 'agent' | 'document';
  itemName: string;
  isDeleting: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteDialog({
  itemType,
  itemName,
  isDeleting,
  errorMessage,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const dialog = useRef<HTMLElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const isDeletingRef = useRef(isDeleting);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    isDeletingRef.current = isDeleting;
    onCancelRef.current = onCancel;
  }, [isDeleting, onCancel]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isDeletingRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const cancel = () => {
    if (!isDeletingRef.current) onCancelRef.current();
  };
  const context = itemType === 'document' ? 'from your knowledge base' : 'from your workspace';

  return (
    <div
      className="confirm-delete-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <section
        ref={dialog}
        className="confirm-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="confirm-delete-header">
          <span><Trash2 size={18} /></span>
          <button type="button" aria-label="Close delete confirmation" disabled={isDeleting} onClick={cancel}><X size={18} /></button>
        </header>
        <div className="confirm-delete-copy">
          <h2 id="confirm-delete-title">Delete this {itemType}?</h2>
          <p id="confirm-delete-description">
            Are you sure you want to delete <strong>{itemName}</strong> {context}? This action cannot be undone.
          </p>
        </div>
        {errorMessage && <p className="confirm-delete-error" role="alert">{errorMessage}</p>}
        <div className="confirm-delete-actions">
          <button type="button" className="confirm-delete-cancel" ref={cancelButton} disabled={isDeleting} onClick={cancel}>Cancel</button>
          <button type="button" className="confirm-delete-confirm" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? <><span className="confirm-delete-spinner" /> Deleting...</> : <><Trash2 size={15} /> Delete {itemType}</>}
          </button>
        </div>
      </section>
    </div>
  );
}

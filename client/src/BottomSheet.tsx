import { useEffect, useRef, type ReactNode } from "react";

/**
 * A sheet that rises from the bottom of the screen (the redesigned Circle tab, 2026-11-06). A native
 * <dialog> opened with showModal(): the browser keeps focus inside it, Escape closes it, and the
 * page behind can't be tapped. A tap on the dimmed backdrop closes it too, as does Close.
 */
export function BottomSheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="bottom-sheet"
      aria-labelledby={labelledBy}
      onClose={onClose}
      // The dialog element itself is only hit outside the sheet's body: that's the backdrop.
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="bottom-sheet__body">
        <p className="bottom-sheet__close">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </p>
        {open && children}
      </div>
    </dialog>
  );
}

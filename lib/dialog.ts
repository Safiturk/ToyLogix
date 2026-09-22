/** Open a modal and restore the page's scroll and focus when it unmounts. */
export function openDialog(dialog: HTMLDialogElement | null) {
  const previousFocus = document.activeElement as HTMLElement | null;
  const previousOverflow = document.body.style.overflow;
  dialog?.showModal();
  document.body.style.overflow = "hidden";
  return () => {
    dialog?.close();
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus();
  };
}

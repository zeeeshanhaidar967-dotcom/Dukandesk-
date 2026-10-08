/**
 * Global input stabilization for Android Chromium, WebView, Gboard & desktop.
 * Ensures natural left-to-right typing progression ("ABC" -> "ABC") and prevents
 * erroneous cursor resets to position 0 during React controlled component updates.
 *
 * Safe & non-intrusive: Does NOT monkey-patch DOM prototypes, preserving React's
 * internal valueTracker and reconciliation mechanics.
 */
export function installGboardFix(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const caretTracker = new WeakMap<HTMLInputElement | HTMLTextAreaElement, number>();

  const isEligibleInput = (el: any): el is (HTMLInputElement | HTMLTextAreaElement) => {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const type = (el.type || 'text').toLowerCase();
      // Selection range only applies to these types per HTML spec
      return ['text', 'search', 'url', 'tel', 'password'].includes(type);
    }
    return false;
  };

  const restoreCaretIfErrantlyReset = (el: HTMLInputElement | HTMLTextAreaElement) => {
    if (document.activeElement !== el) return;
    const targetPos = caretTracker.get(el);
    if (targetPos === undefined || targetPos <= 0) return;

    try {
      // If the browser or framework errantly reset cursor to 0 while user was typing ahead
      if (el.selectionStart === 0 && targetPos > 0 && el.value.length > 0) {
        const safePos = Math.min(targetPos, el.value.length);
        el.setSelectionRange(safePos, safePos);
      }
    } catch {
      // Ignore if input type doesn't support selection range
    }
  };

  // 1. Capture user typing intentions on beforeinput
  window.addEventListener(
    'beforeinput',
    (e: Event) => {
      const target = e.target;
      if (isEligibleInput(target) && document.activeElement === target) {
        const currentPos = target.selectionStart ?? target.value.length;
        const inputEvent = e as InputEvent;
        const insertedLen = inputEvent.data ? inputEvent.data.length : 1;
        const expected = currentPos + insertedLen;
        caretTracker.set(target, expected);
      }
    },
    { capture: true, passive: true }
  );

  // 2. Track caret position on input
  window.addEventListener(
    'input',
    (e: Event) => {
      const target = e.target;
      if (isEligibleInput(target) && document.activeElement === target) {
        const currentPos = target.selectionStart ?? target.value.length;
        const previousExpected = caretTracker.get(target) ?? 0;
        const finalExpected = Math.max(previousExpected, currentPos);
        caretTracker.set(target, finalExpected);

        // Schedule check after React commits updates
        queueMicrotask(() => restoreCaretIfErrantlyReset(target));
        requestAnimationFrame(() => restoreCaretIfErrantlyReset(target));
      }
    },
    { capture: true, passive: true }
  );

  // 3. Clear tracker on blur
  window.addEventListener(
    'blur',
    (e: FocusEvent) => {
      const target = e.target;
      if (isEligibleInput(target)) {
        caretTracker.delete(target);
      }
    },
    { capture: true, passive: true }
  );
}

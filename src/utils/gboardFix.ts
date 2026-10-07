/**
 * Global input stabilization - strictly non-intrusive.
 * Does NOT manipulate caret or setSelectionRange asynchronously.
 */
export function installGboardFix(): void {
  // Intentionally inert: native React controlled input handling handles caret tracking correctly.
}


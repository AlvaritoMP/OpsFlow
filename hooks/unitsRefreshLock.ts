let backgroundRefreshPauseCount = 0;

/** Evita que un refresh en segundo plano pise ediciones locales (p. ej. rostering). */
export function pauseUnitsBackgroundRefresh(): void {
  backgroundRefreshPauseCount += 1;
}

export function resumeUnitsBackgroundRefresh(): void {
  backgroundRefreshPauseCount = Math.max(0, backgroundRefreshPauseCount - 1);
}

export function isUnitsBackgroundRefreshPaused(): boolean {
  return backgroundRefreshPauseCount > 0;
}

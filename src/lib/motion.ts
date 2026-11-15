export const TRANSITION = {
  duration: 0.5,
  ease: "backOut" as const,
};

export const THEME = {
  duration: 0.5,
  ease: "easeOut" as const,
};

export const getTransitionDurationMs = () => TRANSITION.duration * 1000;

export function setMotionEnabled(enabled: boolean) {
  const duration = enabled ? 0.5 : 0;

  TRANSITION.duration = duration;
  THEME.duration = duration;

  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty(
      "--transition-duration",
      `${duration * 1000}ms`,
    );
  }
}

//  削除検討
export function getDragOpacity(offsetY: number, viewportHeight: number) {
  return Math.min(
    1,
    Math.max(0, 0.5 - offsetY / Math.max(1, viewportHeight / 2)),
  );
}

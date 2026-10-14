export const TRANSITION = {
  duration: 0.5,
  ease: "backOut" as const,
};

export const THEME = {
  duration: 0.5,
  ease: "easeOut" as const,
};

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

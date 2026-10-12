/**
 * Shared motion presets. Durations stay short (≤ 250 ms) so the UI feels responsive, not animated.
 * <MotionConfig reducedMotion="user"> in main.jsx turns movement off for people who prefer reduced motion;
 * opacity fades are kept because they don't cause motion sickness.
 */
export const ease = [0.22, 1, 0.36, 1]; // ease-out-quint
export const spring = { type: "spring", stiffness: 500, damping: 38, mass: 0.8 };

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/** List items: rise in, collapse out (layout keeps neighbours sliding smoothly into place). */
export const listItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};

/** Parent for staggered children, e.g. the five recommendation cards. */
export const stagger = (gap = 0.06) => ({
  initial: {},
  animate: { transition: { staggerChildren: gap } },
});

export const staggerChild = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
};

export const page = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease } },
};

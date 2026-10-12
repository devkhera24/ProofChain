import { forwardRef } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  outline: "btn border border-line bg-white text-ink hover:border-teal hover:bg-teal/5",
  danger: "btn bg-contradicts text-white hover:bg-contradicts/90",
};
const SIZES = { sm: "px-2 py-1 text-xs", md: "" };

/**
 * Button with a small press animation and an optional loading spinner.
 * `icon` is a lucide component; `loading` disables the button and swaps the icon for a spinner.
 */
const Button = forwardRef(function Button(
  { variant = "ghost", size = "md", icon: Icon, loading = false, disabled, className, children, type = "button", ...props },
  ref,
) {
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(VARIANTS[variant], SIZES[size], size === "sm" && "gap-1", className)}
      {...props}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        Icon && <Icon size={iconSize} aria-hidden="true" />
      )}
      {children}
    </motion.button>
  );
});

export default Button;

import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary:       "var(--primary)",
        accent:        "var(--accent)",
        surface:       "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-hover":  "var(--surface-hover)",
        canvas:        "var(--background)",
        muted:         "var(--muted)",
        foreground:    "var(--fg)",
        "fg-secondary": "var(--fg-secondary)",
        card:          "var(--card)",
        border:        "var(--border)",
        success:       "var(--success)",
        warning:       "var(--warning)",
        danger:        "var(--danger)",
        info:          "var(--info)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        sm:   "var(--shadow-sm)",
        md:   "var(--shadow-md)",
        lg:   "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
        "glow-teal": "var(--shadow-glow-teal)",
      },
      fontFamily: {
        sans:  ["var(--font-inter)", "var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono:  ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-in":     { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-left":  { from: { opacity: "0", transform: "translateX(-16px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "slide-right": { from: { opacity: "0", transform: "translateX(16px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "scale-in":    { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer:       { "0%": { backgroundPosition: "-200% center" }, "100%": { backgroundPosition: "200% center" } },
        float:         { "0%, 100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-4px)" } },
        "pulse-glow":  { "0%, 100%": { boxShadow: "0 0 8px rgba(99,102,241,0.3)" }, "50%": { boxShadow: "0 0 20px rgba(99,102,241,0.6)" } },
      },
      animation: {
        "fade-in":     "fade-in 0.3s ease both",
        "slide-left":  "slide-left 0.3s ease both",
        "slide-right": "slide-right 0.3s ease both",
        "scale-in":    "scale-in 0.2s ease both",
        shimmer:       "shimmer 1.5s linear infinite",
        float:         "float 3s ease-in-out infinite",
        "pulse-glow":  "pulse-glow 2s ease-in-out infinite",
      },
      transitionDuration: {
        fast: "150ms",
        base: "250ms",
        slow: "350ms",
      },
    },
  },
  plugins: [],
} satisfies Config;

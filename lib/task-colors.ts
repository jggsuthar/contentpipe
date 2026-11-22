/**
 * Task Colors & Styling Constants for ContentPipe
 * Provides strict default color mappings and color resolution utilities.
 */

export const DEFAULT_TASK_HEX_COLORS: Record<string, string> = {
  ideation: "#FFFF00", // Yellow (#FFFF00)
  script: "#f97316",   // Orange (orange-500)
  shoot: "#3b82f6",    // Blue (blue-500)
  edit: "#84cc16",     // Light Green (lime-500)
  schedule: "#10b981", // Green (emerald-500)
  publish: "#6b7280",  // Gray (gray-500)
};

export const COLOR_ID_TO_HEX: Record<string, string> = {
  yellow: "#FFFF00",
  orange: "#f97316",
  blue: "#3b82f6",
  "light-green": "#84cc16",
  green: "#10b981",
  "green-strikethrough": "#6b7280",
  purple: "#a855f7",
  rose: "#f43f5e",
  gray: "#6b7280",
};

export const PRESET_SWATCH_COLORS = [
  { name: "Yellow", hex: "#FFFF00" },
  { name: "Orange", hex: "#f97316" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Light Green", hex: "#84cc16" },
  { name: "Green", hex: "#10b981" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Gray", hex: "#6b7280" },
];

/**
 * Resolves a task's display hex color.
 * Uses custom color if specified (either hex or named token),
 * otherwise falls back to the default task color.
 */
export function resolveTaskColorHex(taskName?: string | null, colorValue?: string | null): string {
  if (colorValue) {
    if (colorValue.startsWith("#")) return colorValue;
    if (COLOR_ID_TO_HEX[colorValue.toLowerCase()]) return COLOR_ID_TO_HEX[colorValue.toLowerCase()];
  }
  const key = taskName ? taskName.toLowerCase().trim() : "";
  return DEFAULT_TASK_HEX_COLORS[key] || "#3b82f6";
}

/**
 * Determines whether text on a given raw background color should be black or white.
 */
export function getContrastTextColor(hexColor: string): "black" | "white" {
  if (!hexColor) return "black";
  let c = hexColor.replace("#", "").trim();
  if (c.length === 3) {
    c = c.split("").map((ch) => ch + ch).join("");
  }
  if (c.length !== 6) return "black";
  const num = parseInt(c, 16);
  if (isNaN(num)) return "black";
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  // Standard luminance formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "black" : "white";
}

/**
 * Returns solid box pill classes for text readability over exact raw task colors:
 * - If font color is black, wrap text in a small solid white box: bg-white text-black
 * - If font color is white, wrap text in a small solid black box: bg-black text-white
 */
export function getContrastPillStyles(hexColor: string): {
  boxClass: string;
  fontColor: "black" | "white";
  boxBg: "white" | "black";
} {
  const fontColor = getContrastTextColor(hexColor);
  if (fontColor === "black") {
    return {
      fontColor: "black",
      boxBg: "white",
      boxClass: "bg-white text-black font-semibold shadow-xs",
    };
  }
  return {
    fontColor: "white",
    boxBg: "black",
    boxClass: "bg-black text-white font-semibold shadow-xs",
  };
}

/**
 * Converts a hex color (#RRGGBB or #RGB) to rgba() string with specified alpha opacity.
 */
export function hexToRgba(hex: string, alpha: number = 0.08): string {
  if (!hex) return "transparent";
  let c = hex.replace("#", "").trim();
  if (c.length === 3) {
    c = c.split("").map((ch) => ch + ch).join("");
  }
  if (c.length !== 6) {
    // If not valid 6-char hex, fallback to default blue with alpha
    return `rgba(59, 130, 246, ${alpha})`;
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return "transparent";
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

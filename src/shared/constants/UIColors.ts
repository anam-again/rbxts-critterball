/**
 * Centralized UI colors used across the codebase.
 * Using constants prevents color inconsistencies and makes theme changes easier.
 */

import { rgbToColor3, RGBTuple } from "shared/utilities/ColorUtils";

// Common UI background colors (as RGB tuples for consistency)
export const UI_COLOR_TUPLES = {
	// Backgrounds
	BACKGROUND_DARK: [26, 26, 31] as const,
	BACKGROUND_MEDIUM: [38, 38, 46] as const,
	PANEL: [38, 38, 46] as const,
	OVERLAY: [0, 0, 0] as const,

	// Buttons
	BUTTON_PRIMARY: [51, 128, 77] as const,
	BUTTON_PRIMARY_HOVER: [64, 153, 89] as const,
	BUTTON_SECONDARY: [51, 51, 51] as const,
	BUTTON_DANGER: [153, 51, 51] as const,
	BUTTON_DISABLED: [77, 77, 77] as const,
	BUTTON_SELECTED: [51, 102, 153] as const,

	// Text
	TEXT_PRIMARY: [255, 255, 255] as const,
	TEXT_SECONDARY: [180, 180, 180] as const,
	TEXT_DIM: [128, 128, 128] as const,

	// Status indicators
	STATUS_READY: [77, 179, 77] as const,
	STATUS_NOT_READY: [153, 153, 51] as const,
	STATUS_LEADER: [255, 215, 0] as const,

	// Accent colors
	ACCENT_GOLD: [255, 215, 0] as const,
	ACCENT_CYAN: [50, 220, 255] as const,
	ACCENT_BLUE: [80, 150, 255] as const,
} as const;

// Pre-computed Color3 values for direct use
export const UI_COLORS = {
	// Backgrounds
	BACKGROUND_DARK: rgbToColor3(UI_COLOR_TUPLES.BACKGROUND_DARK),
	BACKGROUND_MEDIUM: rgbToColor3(UI_COLOR_TUPLES.BACKGROUND_MEDIUM),
	PANEL: rgbToColor3(UI_COLOR_TUPLES.PANEL),
	OVERLAY: rgbToColor3(UI_COLOR_TUPLES.OVERLAY),

	// Buttons
	BUTTON_PRIMARY: rgbToColor3(UI_COLOR_TUPLES.BUTTON_PRIMARY),
	BUTTON_PRIMARY_HOVER: rgbToColor3(UI_COLOR_TUPLES.BUTTON_PRIMARY_HOVER),
	BUTTON_SECONDARY: rgbToColor3(UI_COLOR_TUPLES.BUTTON_SECONDARY),
	BUTTON_DANGER: rgbToColor3(UI_COLOR_TUPLES.BUTTON_DANGER),
	BUTTON_DISABLED: rgbToColor3(UI_COLOR_TUPLES.BUTTON_DISABLED),
	BUTTON_SELECTED: rgbToColor3(UI_COLOR_TUPLES.BUTTON_SELECTED),

	// Text
	TEXT_PRIMARY: rgbToColor3(UI_COLOR_TUPLES.TEXT_PRIMARY),
	TEXT_SECONDARY: rgbToColor3(UI_COLOR_TUPLES.TEXT_SECONDARY),
	TEXT_DIM: rgbToColor3(UI_COLOR_TUPLES.TEXT_DIM),

	// Status indicators
	STATUS_READY: rgbToColor3(UI_COLOR_TUPLES.STATUS_READY),
	STATUS_NOT_READY: rgbToColor3(UI_COLOR_TUPLES.STATUS_NOT_READY),
	STATUS_LEADER: rgbToColor3(UI_COLOR_TUPLES.STATUS_LEADER),

	// Accent colors
	ACCENT_GOLD: rgbToColor3(UI_COLOR_TUPLES.ACCENT_GOLD),
	ACCENT_CYAN: rgbToColor3(UI_COLOR_TUPLES.ACCENT_CYAN),
	ACCENT_BLUE: rgbToColor3(UI_COLOR_TUPLES.ACCENT_BLUE),
} as const;

// Type exports
export type UIColorTuple = (typeof UI_COLOR_TUPLES)[keyof typeof UI_COLOR_TUPLES];
export type UIColor = (typeof UI_COLORS)[keyof typeof UI_COLORS];

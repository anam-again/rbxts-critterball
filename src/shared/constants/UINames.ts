/**
 * Centralized UI element names used throughout the codebase.
 * Using constants prevents typos and makes refactoring easier.
 */

// ScreenGui names
export const SCREEN_GUI_NAMES = {
	RACE_UI: "RaceUI",
	QUEUE_GUI: "QueueGui",
	GAME_MENU_UI: "GameMenuUI",
	SPEEDOMETER_GUI: "SpeedometerGui",
} as const;

// Common UI element names
export const UI_ELEMENT_NAMES = {
	MAIN_FRAME: "MainFrame",
	CLOSE_BUTTON: "CloseButton",
	TITLE: "Title",
	CONTENT: "Content",
} as const;

// Effect names (Lighting effects)
export const EFFECT_NAMES = {
	IMPACT_BLUR: "ImpactBlur",
	SPEED_COLOR_CORRECTION: "SpeedColorCorrection",
} as const;

// Particle emitter names
export const PARTICLE_NAMES = {
	ROLLING_DUST: "RollingDust",
	IMPACT_PARTICLES: "ImpactParticles",
	POWERUP_PICKUP_PARTICLES: "PowerupPickupParticles",
} as const;

// Type exports
export type ScreenGuiName = (typeof SCREEN_GUI_NAMES)[keyof typeof SCREEN_GUI_NAMES];
export type UIElementName = (typeof UI_ELEMENT_NAMES)[keyof typeof UI_ELEMENT_NAMES];
export type EffectName = (typeof EFFECT_NAMES)[keyof typeof EFFECT_NAMES];
export type ParticleName = (typeof PARTICLE_NAMES)[keyof typeof PARTICLE_NAMES];

import { rgbToColor3 } from "shared/utilities/ColorUtils";

// Race system configuration constants
export const RaceConfig = {
	TOTAL_LAPS: 3,
	DEFAULT_RESPAWN_BARRIER_Y: -400,

	// Race start sequence timing
	SHOWCASE_MIN_DURATION: 10, // Minimum seconds in showcase mode
	SHOWCASE_MAX_DURATION: 30, // Timeout for waiting for players
	STARTING_DURATION: 5, // "Race about to start" duration before countdown
	COUNTDOWN_DURATION: 5, // 5-4-3-2-1 countdown seconds
	SHOWCASE_CAMERA_LERP: 0.02, // Smoothness of camera movement between waypoints
	CAMERA_TRANSITION_DURATION: 2, // Seconds to transition from showcase to player camera

	// Race status messages
	WAITING_TEXT: "Waiting for players",
	STARTING_TEXT: "Race about to start",
	STATUS_FONT_SIZE: 48,
	STATUS_COLOR: [255, 255, 255] as const,

	// Countdown UI
	COUNTDOWN_FONT_SIZE: 120,
	COUNTDOWN_COLOR: [255, 255, 255] as const,
	COUNTDOWN_GO_TEXT: "Race!",
	COUNTDOWN_GO_COLOR: [255, 215, 0] as const, // Gold

	// UI positioning
	RACE_HUD_TOP_OFFSET: 100,
	RACE_HUD_RIGHT_OFFSET: 20,
	FINISH_SCREEN_DELAY: 0.5,

	// UI sizing
	RACE_HUD_WIDTH: 280,
	RACE_HUD_PADDING: 16,
	TIMER_FONT_SIZE: 56,
	LAP_TIMER_FONT_SIZE: 24,
	LAP_COUNTER_FONT_SIZE: 20,

	// Lap notification (center screen)
	LAP_NOTIFICATION_FONT_SIZE: 72,
	LAP_NOTIFICATION_ANIMATE_IN_TIME: 0.3,
	LAP_NOTIFICATION_HOLD_TIME: 1.5,
	LAP_NOTIFICATION_ANIMATE_OUT_TIME: 0.3,

	// Finish screen
	FINISH_TITLE_FONT_SIZE: 72,
	FINISH_TIME_FONT_SIZE: 48,
	FINISH_OVERLAY_TRANSPARENCY: 0.7,

	// Colors (RGB 0-255)
	TIMER_COLOR: [255, 255, 255] as const,
	LAP_TIMER_COLOR: [200, 200, 200] as const,
	LAP_COUNTER_COLOR: [180, 180, 180] as const,
	LAP_NOTIFICATION_COLOR: [255, 215, 0] as const, // Gold
	FINISH_TITLE_COLOR: [255, 215, 0] as const, // Gold
	FINISH_TIME_COLOR: [255, 255, 255] as const,
	HUD_BACKGROUND_COLOR: [0, 0, 0] as const,
	HUD_BACKGROUND_TRANSPARENCY: 0.5,
} as const;

// Pre-computed Color3 values for direct use (avoids repeated Color3 construction)
export const RaceColors = {
	TIMER: rgbToColor3(RaceConfig.TIMER_COLOR),
	LAP_TIMER: rgbToColor3(RaceConfig.LAP_TIMER_COLOR),
	LAP_COUNTER: rgbToColor3(RaceConfig.LAP_COUNTER_COLOR),
	LAP_NOTIFICATION: rgbToColor3(RaceConfig.LAP_NOTIFICATION_COLOR),
	FINISH_TITLE: rgbToColor3(RaceConfig.FINISH_TITLE_COLOR),
	FINISH_TIME: rgbToColor3(RaceConfig.FINISH_TIME_COLOR),
	HUD_BACKGROUND: rgbToColor3(RaceConfig.HUD_BACKGROUND_COLOR),
	STATUS: rgbToColor3(RaceConfig.STATUS_COLOR),
	COUNTDOWN: rgbToColor3(RaceConfig.COUNTDOWN_COLOR),
	COUNTDOWN_GO: rgbToColor3(RaceConfig.COUNTDOWN_GO_COLOR),
} as const;

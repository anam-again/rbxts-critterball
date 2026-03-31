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

	// Position UI
	POSITION_UPDATE_INTERVAL: 0.1, // Seconds between position updates
	POSITION_FONT_SIZE: 72,
	POSITION_SUFFIX_FONT_SIZE: 32,
	POSITION_FLASH_DURATION: 0.3,
	POSITION_PULSE_SCALE: 1.15, // Scale when pulsing on position gain
	POSITION_PULSE_DURATION: 0.2, // Duration of pulse animation

	// Leaderboard UI
	LEADERBOARD_SHOW_DELAY: 5, // Seconds after race start to show HUD and leaderboard
	LEADERBOARD_FADE_DURATION: 0.3, // Fade in animation time
	LEADERBOARD_ROW_HEIGHT: 32, // Height of each racer row
	LEADERBOARD_MAX_RACERS: 8, // Fixed number of rows to display (matches TARGET_RACER_COUNT)
	LEADERBOARD_POSITION_TWEEN_TIME: 0.3, // Row position animation time
	LEADERBOARD_WIDTH: 280, // Same as HUD width
	LEADERBOARD_GAP_FROM_HUD: 16, // Gap between HUD and leaderboard
	LEADERBOARD_NAME_MAX_LENGTH: 12, // Truncate names longer than this
	LEADERBOARD_LOCAL_PLAYER_BG: [40, 60, 100] as const, // Subtle blue background for local player
	LEADERBOARD_POSITION_WIDTH: 30, // Width reserved for position number
	LEADERBOARD_CORNER_RADIUS: 8,
	LEADERBOARD_PADDING: 12,
	LEADERBOARD_POSITION_FONT_SIZE: 18,
	LEADERBOARD_NAME_FONT_SIZE: 16,

	// Colors (RGB 0-255)
	TIMER_COLOR: [255, 255, 255] as const,
	LAP_TIMER_COLOR: [200, 200, 200] as const,
	LAP_COUNTER_COLOR: [180, 180, 180] as const,
	LAP_NOTIFICATION_COLOR: [255, 215, 0] as const, // Gold
	FINISH_TITLE_COLOR: [255, 215, 0] as const, // Gold
	FINISH_TIME_COLOR: [255, 255, 255] as const,
	HUD_BACKGROUND_COLOR: [0, 0, 0] as const,
	HUD_BACKGROUND_TRANSPARENCY: 0.5,
	POSITION_COLOR: [255, 255, 255] as const,
	POSITION_1ST_COLOR: [255, 215, 0] as const, // Gold
	POSITION_2ND_COLOR: [192, 192, 192] as const, // Silver
	POSITION_3RD_COLOR: [205, 127, 50] as const, // Bronze
	POSITION_GAIN_COLOR: [50, 255, 50] as const,
	POSITION_LOSE_COLOR: [255, 50, 50] as const,
	LEADERBOARD_LOCAL_PLAYER_BG_COLOR: [40, 60, 100] as const, // Subtle blue for local player row
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
	POSITION: rgbToColor3(RaceConfig.POSITION_COLOR),
	POSITION_1ST: rgbToColor3(RaceConfig.POSITION_1ST_COLOR),
	POSITION_2ND: rgbToColor3(RaceConfig.POSITION_2ND_COLOR),
	POSITION_3RD: rgbToColor3(RaceConfig.POSITION_3RD_COLOR),
	POSITION_GAIN: rgbToColor3(RaceConfig.POSITION_GAIN_COLOR),
	POSITION_LOSE: rgbToColor3(RaceConfig.POSITION_LOSE_COLOR),
	LEADERBOARD_LOCAL_PLAYER_BG: rgbToColor3(RaceConfig.LEADERBOARD_LOCAL_PLAYER_BG_COLOR),
} as const;

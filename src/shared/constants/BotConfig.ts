/**
 * Bot AI configuration constants.
 * Bots are server-controlled balls that navigate using waypoints.
 */
export const BotConfig = {
	// Spawning
	MAX_BOTS: 7,
	BOT_SPAWN_DELAY: 0.5, // Seconds between spawning each bot
	TARGET_RACER_COUNT: 8, // Total racers (players + bots) for auto-fill
	DEFAULT_BOT_RIG: "DefaultJonesy", // Rig model to use for bot characters

	// Navigation
	WAYPOINT_CAPTURE_RADIUS: 10, // Distance to consider waypoint reached
	WAYPOINT_LOOKAHEAD: 2, // Number of waypoints to consider for selection

	// Movement (relative to BallConfig)
	IMPULSE_MULTIPLIER: 0.7, // Base multiplier on movement impulse (1.0 = player strength)
	MAX_SPEED_MULTIPLIER: 0.75, // Base multiplier on max speed (1.0 = player max)
	TURN_FORCE_MULTIPLIER: 3.0, // Base multiplier on turn force (1.0 = player turn strength)

	// Ground/Jump
	GROUND_CHECK_INTERVAL: 0.1, // Seconds between ground raycasts
	JUMP_ANTICIPATION_DISTANCE: 15, // Distance to start jump when approaching JumpZone waypoint

	// Avoidance
	AVOID_DEFAULT_RADIUS: 20, // Default avoidance zone radius
	AVOID_DEFAULT_STRENGTH: 1.0, // Default avoidance strength
	AVOID_FORCE_MULTIPLIER: 1.5, // Multiplier on avoidance forces
	AVOID_FALLOFF_EXPONENT: 2, // How quickly avoidance falls off with distance

	// Recovery
	STUCK_DETECTION_TIME: 3, // Seconds without progress before considered stuck
	STUCK_VELOCITY_THRESHOLD: 5, // Velocity below this is considered not moving

	// Difficulty presets (slower than players but with strong turning)
	DIFFICULTY: {
		EASY: {
			impulseMultiplier: 0.7, // 70% player acceleration
			maxSpeedMultiplier: 0.7, // 70% player top speed
			turnMultiplier: 2.0, // 2x turn force
			reactionDelay: 0.15,
		},
		MEDIUM: {
			impulseMultiplier: 0.85, // 85% player acceleration
			maxSpeedMultiplier: 0.8, // 80% player top speed
			turnMultiplier: 2.5, // 2.5x turn force
			reactionDelay: 0.08,
		},
		HARD: {
			impulseMultiplier: 1.0, // Same as player acceleration
			maxSpeedMultiplier: 0.9, // 90% player top speed
			turnMultiplier: 3.0, // 3x turn force
			reactionDelay: 0.02,
		},
	},
} as const;

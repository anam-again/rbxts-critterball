// CollectionService tags for Critterball
// Add game-specific tags here as needed
export const TAGS = {
	QUEUE_TERMINAL: "QueueTerminal",
	SPEED_BOOST_ZONE: "SpeedBoostZone",
	BOUNCER: "Bouncer",
	SPEED_POWERUP: "SpeedPowerup",
	RACE_CHECKPOINTS: "RaceCheckpoints",
	SHOWCASE_CAMERA_WAYPOINTS: "ShowcaseCameraWaypoints",
	BOT_WAYPOINTS: "BotWaypoints",
	BOT_AVOID_WAYPOINTS: "BotAvoidWaypoints",
} as const;

// Attribute names for speed boost zones
// BoostForce: number - Impulse force to apply (default: 50000)
// BoostDirection: string - "Forward" (zone's LookVector) or "Velocity" (player's movement direction)
export const SPEED_BOOST_ATTRIBUTES = {
	BOOST_FORCE: "BoostForce",
	BOOST_DIRECTION: "BoostDirection",
} as const;

// Attribute names for bouncers
// ImpulseForce: number - Horizontal impulse force to apply (default: 80000)
export const BOUNCER_ATTRIBUTES = {
	IMPULSE_FORCE: "ImpulseForce",
} as const;

export type TAGS_KEYS = keyof typeof TAGS;

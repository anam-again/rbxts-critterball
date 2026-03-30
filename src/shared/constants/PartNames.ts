/**
 * Centralized part/instance names used throughout the codebase.
 * Using constants prevents typos and makes refactoring easier.
 */

// Ball model parts
export const PART_NAMES = {
	// Ball model parts
	SPHERE: "Sphere",
	NEON_GLOW: "NeonGlow",
	TRAIL_ANCHOR: "TrailAnchor",

	// Boost zone parts
	BOOST_ZONE: "BoostZone",
	BOOST_ARROW_1: "BoostArrow1",
	BOOST_ARROW_2: "BoostArrow2",
	BOOST_ARROW_3: "BoostArrow3",
	BODY: "Body",
	OUTLINE: "Outline",

	// Bouncer parts
	IMPACT_AREA: "ImpactArea",
	MAIN_BOUNCER: "MainBouncer",

	// Powerup parts
	COLLISION_BOX: "CollisionBox",

	// Checkpoint parts
	CHECKPOINT: "Checkpoint",
	SPAWN_POINT_PREFIX: "SpawnPoint",

	// Character parts
	HUMANOID: "Humanoid",
	HUMANOID_ROOT_PART: "HumanoidRootPart",
	ANIMATE: "Animate",
	ANIMATOR: "Animator",

	// Workspace containers
	MAP: "Map",
	BALLS: "Balls",
	TRAILS: "Trails",

	// Constraint/attachment names
	BALL_ATTACHMENT: "BallAttachment",
	CHARACTER_ATTACHMENT: "CharacterAttachment",
	BALL_CONSTRAINT: "BallConstraint",
	GRAVITY_ATTACHMENT: "GravityAttachment",
	GRAVITY_REDUCTION: "GravityReduction",
	TRAIL_WELD: "TrailWeld",
	ROLLING_DUST_ATTACHMENT: "RollingDustAttachment",
} as const;

// Attribute names used on instances
export const ATTRIBUTE_NAMES = {
	// Map folder attributes
	RESPAWN_BARRIER_Y: "RespawnBarrierY",
	DEFAULT_GAMEMODE: "DefaultGamemode",
	SKIP_INTRO: "SkipIntro",

	// Boost zone attributes (also in globals.ts SPEED_BOOST_ATTRIBUTES)
	BOOST_FORCE: "BoostForce",
	BOOST_DIRECTION: "BoostDirection",

	// Bouncer attributes (also in globals.ts BOUNCER_ATTRIBUTES)
	IMPULSE_FORCE: "ImpulseForce",

	// Bot waypoint attributes
	JUMP_ZONE: "JumpZone",
	WAYPOINT_RADIUS: "Radius",

	// Bot avoid waypoint attributes
	AVOID_RADIUS: "AvoidRadius",
	AVOID_STRENGTH: "AvoidStrength",
} as const;

// Type exports for type-safe string usage
export type PartName = (typeof PART_NAMES)[keyof typeof PART_NAMES];
export type AttributeName = (typeof ATTRIBUTE_NAMES)[keyof typeof ATTRIBUTE_NAMES];

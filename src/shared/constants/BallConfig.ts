import { rgbToColor3 } from "shared/utilities/ColorUtils";

// Physics tuning constants for ball movement
export const BallConfig = {
	MOVE_IMPULSE_FORCE: 100000,
	JUMP_IMPULSE_FORCE: 37500,
	ROLL_TORQUE_FORCE: 50000,
	BALL_FRICTION: 0.3,
	BALL_ELASTICITY: 0.5,
	JUMP_COOLDOWN: 0.5,
	GROUND_RAYCAST_DISTANCE: 1, // Buffer beyond sphere radius

	// Speed limits
	MAX_SPEED: 200,
	LOW_SPEED_THRESHOLD: 30,
	LOW_SPEED_MULTIPLIER: 3,
	DIMINISHING_RETURNS_START: 60, // Speed at which acceleration starts diminishing
	DIMINISHING_RETURNS_MIN: 0.1, // Minimum acceleration multiplier at max speed
	VELOCITY_DAMPING: 0.25, // Velocity reduction per second (0 = no damping, 1 = full stop in 1 sec)

	// Turning
	TURN_FORCE: 150,
	TURN_SPEED_FACTOR: 0.8, // How much current speed converts to new direction (0-1)

	// Gravity
	GRAVITY_MULTIPLIER: 0.7, // 1 = normal gravity, 0 = no gravity

	// Templates
	DEFAULT_BALL: "DefaultBall",
	DEFAULT_TRAIL: "DefaultTrail",

	// Camera zoom
	CAMERA_MIN_ZOOM: 10, // Minimum zoom distance (closest to ball)
	CAMERA_MAX_ZOOM: 50, // Maximum zoom distance (farthest from ball)

	// Camera trailing
	CAMERA_TRAIL_AMOUNT: 0.05, // How much camera trails behind (multiplier on velocity)
	CAMERA_TRAIL_LERP_SPEED: 6, // How smoothly camera catches up
	CAMERA_TRAIL_MAX_OFFSET: 15, // Max distance camera can trail behind (extended for high speeds)

	// Camera FOV - extended for extreme speeds (500+)
	FOV_BASE: 75, // Default FOV
	FOV_SOFT_MAX: 100, // FOV at soft cap speed (linear scaling up to 200)
	FOV_HARD_MAX: 130, // Absolute max FOV at extreme speeds
	FOV_SPEED_MIN: 15, // Speed to start FOV increase
	FOV_SPEED_SOFT_MAX: 200, // Speed for soft cap (linear scaling ends at normal max)
	FOV_SPEED_HARD_MAX: 500, // Speed where FOV approaches hard max
	FOV_LERP_SPEED: 8, // How fast FOV changes (higher = snappier)

	// Impact blur
	IMPACT_BLUR_VELOCITY_MIN: 40, // Min velocity change to trigger blur
	IMPACT_BLUR_VELOCITY_MAX: 100, // Velocity change for max blur
	IMPACT_BLUR_SIZE_MAX: 3, // Max blur size on heavy impact
	IMPACT_BLUR_DECAY_RATE: 80, // How fast blur fades

	// Speed display multiplier (shown speed = actual speed * this)
	SPEED_DISPLAY_MULTIPLIER: 2.2,

	// Saturation boost at high speeds (uses shown/display speed)
	SATURATION_SPEED_MIN: 500, // Shown speed to start saturation boost
	SATURATION_SPEED_MAX: 1000, // Shown speed for max saturation boost
	SATURATION_MIN: 0, // No saturation boost at low speeds
	SATURATION_MAX: 1.0, // Max saturation boost (ColorCorrection Saturation range is -1 to 1)
	SATURATION_LERP_SPEED: 5, // How fast saturation changes

	// Screen shake - extended for extreme speeds (500+)
	SHAKE_IMPACT_INTENSITY: 3.0, // Max shake intensity from impacts (doubled)
	SHAKE_IMPACT_VELOCITY_MIN: 20, // Min velocity change to trigger shake (lowered for more frequent shakes)
	SHAKE_IMPACT_VELOCITY_MAX: 100, // Velocity change for max shake
	SHAKE_SPEED_INTENSITY: 0.3, // Max shake intensity from high speed (increased for extreme speeds)
	SHAKE_SPEED_MIN: 70, // Speed to start speed-based shake
	SHAKE_SPEED_SOFT_MAX: 200, // Speed for normal max shake (linear scaling)
	SHAKE_SPEED_HARD_MAX: 500, // Speed for extreme shake (diminishing returns)
	SHAKE_DECAY_RATE: 5, // How fast shake decays per second
	SHAKE_FREQUENCY: 30, // Shake oscillations per second

	// Rolling dust - extended for extreme speeds
	ROLLING_DUST_MIN_SPEED: 5, // Minimum speed to start emitting dust
	ROLLING_DUST_SOFT_MAX_SPEED: 100, // Speed for normal max dust (linear scaling)
	ROLLING_DUST_HARD_MAX_SPEED: 400, // Speed for extreme dust (diminishing returns)
	ROLLING_DUST_RATE_MIN: 15, // Particles per second at min speed
	ROLLING_DUST_RATE_SOFT_MAX: 100, // Particles per second at soft max
	ROLLING_DUST_RATE_HARD_MAX: 200, // Particles per second at extreme speeds
	ROLLING_DUST_SIZE: 0.6, // Base particle size
	ROLLING_DUST_LIFETIME: 0.8, // How long dust particles last

	// Impact particles
	IMPACT_VELOCITY_THRESHOLD: 10, // Minimum velocity change to trigger particles
	IMPACT_PARTICLE_COUNT_MIN: 10, // Particles at threshold
	IMPACT_PARTICLE_COUNT_MAX: 80, // Particles at max impact
	IMPACT_MAX_VELOCITY_CHANGE: 100, // Velocity change for max particles
	IMPACT_SPEED_MIN: 15, // Particle speed at threshold
	IMPACT_SPEED_MAX: 50, // Particle speed at max impact
	IMPACT_SIZE_MIN: 0.3, // Particle size at threshold
	IMPACT_SIZE_MAX: 1.0, // Particle size at max impact

	// Trail dynamics - extended for extreme speeds (500+)
	TRAIL_SPEED_SOFT_MAX: 200, // Speed for normal max trail (linear scaling)
	TRAIL_SPEED_HARD_MAX: 500, // Speed for extreme trail (diminishing returns)
	TRAIL_MIN_TRANSPARENCY: 0.95, // At zero speed (almost invisible)
	TRAIL_SOFT_MAX_TRANSPARENCY: 0.6, // At soft max speed
	TRAIL_HARD_MAX_TRANSPARENCY: 0.3, // At extreme speeds (very visible)
	TRAIL_MIN_WIDTH: 0.05, // At zero speed
	TRAIL_SOFT_MAX_WIDTH: 0.75, // At soft max speed
	TRAIL_HARD_MAX_WIDTH: 1.5, // At extreme speeds
	TRAIL_MIN_LIFETIME: 0.02, // At zero speed (very short)
	TRAIL_SOFT_MAX_LIFETIME: 0.5, // At soft max speed
	TRAIL_HARD_MAX_LIFETIME: 1.0, // At extreme speeds
	TRAIL_MIN_MAX_LENGTH: 5, // At zero speed
	TRAIL_MAX_MAX_LENGTH: 500, // At max effect speed (large value, lifetime controls visual)
	// Speedometer UI
	SPEEDOMETER_MAX_DISPLAY_SPEED: 91, // Speed at which bar is full (displays as ~200 with 2.2x multiplier)
	SPEEDOMETER_BAR_WIDTH: 300, // Width of the speed bar in pixels
	SPEEDOMETER_BAR_HEIGHT: 24, // Height of the speed bar in pixels
	SPEEDOMETER_BOTTOM_OFFSET: 60, // Distance from bottom of screen

	// Speed boost zones
	SPEED_BOOST_DEFAULT_FORCE: 50000, // Default impulse force if not specified on zone
	SPEED_BOOST_DEFAULT_DIRECTION: "Forward", // "Forward" = zone's LookVector, "Velocity" = player's velocity direction

	// Speed boost zone visuals
	BOOST_ARROW_CYCLE_SPEED: 0.4, // How fast arrows cycle (cycles per second) - full cycle every 2.5 seconds
	BOOST_OUTLINE_PULSE_SPEED: 0.5, // Sine wave speed for outline
	BOOST_BODY_PULSE_SPEED: 0.4, // Sine wave speed for body
	BOOST_OUTLINE_LOW_TRANSPARENCY: 0.7, // More visible during pulse
	BOOST_OUTLINE_HIGH_TRANSPARENCY: 0.3, // Less visible during pulse
	BOOST_BODY_LOW_TRANSPARENCY: 0.75, // More visible during idle pulse
	BOOST_BODY_HIGH_TRANSPARENCY: 0.95, // Less visible during idle pulse (zone usage = 0)
	BOOST_FLASH_HOLD_DURATION: 0.15, // How long to hold at full visibility after boost
	BOOST_FLASH_FADE_DURATION: 0.3, // How long to fade back to normal

	// Boost zone colors (RGB 0-255)
	BOOST_BODY_COLOR_IDLE: [33, 84, 185] as const, // Normal blue
	BOOST_BODY_COLOR_FLASH: [80, 150, 255] as const, // Bright saturated blue
	BOOST_OUTLINE_COLOR_IDLE: [9, 137, 207] as const, // Normal cyan
	BOOST_OUTLINE_COLOR_FLASH: [50, 220, 255] as const, // Bright saturated cyan
	BOOST_ARROW_COLOR_IDLE: [168, 168, 0] as const, // Normal yellow
	BOOST_ARROW_COLOR_FLASH: [255, 255, 100] as const, // Bright saturated yellow

	// Ball neon glow (flashes on boost)
	NEON_GLOW_FLASH_DURATION: 0.25, // How long the neon glow stays visible after boost

	// Ball neon glow (speed-based visibility)
	NEON_GLOW_SPEED_MIN: 100, // Speed to start showing glow
	NEON_GLOW_SPEED_MAX: 300, // Speed for max glow visibility
	NEON_GLOW_IDLE_TRANSPARENCY: 1.0, // Transparency at idle/low speed (invisible)
	NEON_GLOW_SPEED_MAX_TRANSPARENCY: 0.6, // Transparency at max speed (more visible)
	NEON_GLOW_LERP_SPEED: 3, // How fast transparency changes (higher = snappier)

	// Bouncer settings
	BOUNCER_IMPULSE_FORCE: 80000, // Default horizontal impulse force away from bouncer (can override with ImpulseForce attribute)
	BOUNCER_COOLDOWN: 0.15, // Seconds before same bouncer can trigger again
	BOUNCER_EXPAND_SCALE: 1.4, // How much the MainBouncer grows (1.4 = 40% larger)
	BOUNCER_EXPAND_DURATION: 0.01, // Near-instant expansion (seconds)
	BOUNCER_SHRINK_DURATION: 0.3, // How slowly it shrinks back (seconds)

	// Powerup settings
	POWERUP_RESPAWN_TIME: 3, // Seconds before powerup reappears after pickup
	POWERUP_SPEED_BOOST_FORCE: 300000, // Impulse force when speed powerup is activated
	POWERUP_UI_SIZE: 60, // Pixel size of powerup slot UI
	POWERUP_UI_TOP_OFFSET: 20, // Distance from top of screen

	// Powerup animation
	POWERUP_BOB_SPEED: 0.4, // Cycles per second for floating up/down
	POWERUP_BOB_HEIGHT: 1.5, // Studs to float up/down from center
	POWERUP_SPIN_SPEED: 0.5, // Rotations per second

	// Powerup pickup particles
	POWERUP_PICKUP_PARTICLE_COUNT: 60, // Number of particles on pickup
	POWERUP_PICKUP_PARTICLE_SPEED_MIN: 20, // Min particle speed
	POWERUP_PICKUP_PARTICLE_SPEED_MAX: 50, // Max particle speed
	POWERUP_PICKUP_PARTICLE_SIZE: 1.5, // Peak particle size
	POWERUP_PICKUP_PARTICLE_LIFETIME: 0.8, // Particle lifetime in seconds
	POWERUP_PICKUP_PARTICLE_COLOR: [255, 200, 50] as const, // Golden yellow color (RGB 0-255)
} as const;

// Pre-computed Color3 values for boost zone colors (avoids repeated Color3 construction)
export const BoostColors = {
	BODY_IDLE: rgbToColor3(BallConfig.BOOST_BODY_COLOR_IDLE),
	BODY_FLASH: rgbToColor3(BallConfig.BOOST_BODY_COLOR_FLASH),
	OUTLINE_IDLE: rgbToColor3(BallConfig.BOOST_OUTLINE_COLOR_IDLE),
	OUTLINE_FLASH: rgbToColor3(BallConfig.BOOST_OUTLINE_COLOR_FLASH),
	ARROW_IDLE: rgbToColor3(BallConfig.BOOST_ARROW_COLOR_IDLE),
	ARROW_FLASH: rgbToColor3(BallConfig.BOOST_ARROW_COLOR_FLASH),
} as const;

// Pre-computed Color3 for powerup particles
export const PowerupColors = {
	PICKUP_PARTICLE: rgbToColor3(BallConfig.POWERUP_PICKUP_PARTICLE_COLOR),
} as const;

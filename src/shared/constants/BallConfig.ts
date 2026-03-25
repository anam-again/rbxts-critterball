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
	VELOCITY_DAMPING: 0.5, // Velocity reduction per second (0 = no damping, 1 = full stop in 1 sec)

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
	CAMERA_TRAIL_AMOUNT: 0.03, // How much camera trails behind (multiplier on velocity)
	CAMERA_TRAIL_LERP_SPEED: 5, // How smoothly camera catches up
	CAMERA_TRAIL_MAX_OFFSET: 5, // Max distance camera can trail behind

	// Camera FOV
	FOV_BASE: 80, // Default FOV
	FOV_SOFT_MAX: 95, // FOV at soft cap speed (linear scaling)
	FOV_HARD_MAX: 110, // Absolute max FOV (diminishing returns)
	FOV_SPEED_MIN: 30, // Speed to start FOV increase
	FOV_SPEED_SOFT_MAX: 80, // Speed for soft cap (linear scaling ends)
	FOV_SPEED_HARD_MAX: 200, // Speed where FOV approaches hard max
	FOV_LERP_SPEED: 5, // How fast FOV changes (higher = snappier)

	// Impact blur
	IMPACT_BLUR_VELOCITY_MIN: 40, // Min velocity change to trigger blur
	IMPACT_BLUR_VELOCITY_MAX: 100, // Velocity change for max blur
	IMPACT_BLUR_SIZE_MAX: 3, // Max blur size on heavy impact
	IMPACT_BLUR_DECAY_RATE: 80, // How fast blur fades

	// Screen shake
	SHAKE_IMPACT_INTENSITY: 1.5, // Max shake intensity from impacts
	SHAKE_IMPACT_VELOCITY_MIN: 30, // Min velocity change to trigger shake
	SHAKE_IMPACT_VELOCITY_MAX: 100, // Velocity change for max shake
	SHAKE_SPEED_INTENSITY: 0.1, // Max shake intensity from high speed
	SHAKE_SPEED_MIN: 70, // Speed to start speed-based shake
	SHAKE_SPEED_MAX: 100, // Speed for max speed-based shake
	SHAKE_DECAY_RATE: 5, // How fast shake decays per second
	SHAKE_FREQUENCY: 30, // Shake oscillations per second

	// Rolling dust
	ROLLING_DUST_MIN_SPEED: 5, // Minimum speed to start emitting dust
	ROLLING_DUST_MAX_SPEED: 60, // Speed for max dust effect
	ROLLING_DUST_RATE_MIN: 15, // Particles per second at min speed
	ROLLING_DUST_RATE_MAX: 100, // Particles per second at max speed
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

	// Trail dynamics
	TRAIL_SPEED_FOR_MAX_EFFECT: 150, // Speed required for full trail effect
	TRAIL_MIN_TRANSPARENCY: 0.95, // At zero speed (almost invisible)
	TRAIL_MAX_TRANSPARENCY: 0.7, // At max effect speed
	TRAIL_MIN_WIDTH: 0.05, // At zero speed
	TRAIL_MAX_WIDTH: 0.75, // At max effect speed
	TRAIL_MIN_LIFETIME: 0.02, // At zero speed (very short)
	TRAIL_MAX_LIFETIME: 0.5, // At max effect speed
	TRAIL_MIN_MAX_LENGTH: 5, // At zero speed
	TRAIL_MAX_MAX_LENGTH: 500, // At max effect speed (large value, lifetime controls visual)
	// Speedometer UI
	SPEEDOMETER_MAX_DISPLAY_SPEED: 91, // Speed at which bar is full (displays as ~200 with 2.2x multiplier)
	SPEEDOMETER_BAR_WIDTH: 300, // Width of the speed bar in pixels
	SPEEDOMETER_BAR_HEIGHT: 24, // Height of the speed bar in pixels
	SPEEDOMETER_BOTTOM_OFFSET: 60, // Distance from bottom of screen
} as const;

/**
 * Centralized input action names for ContextActionService bindings.
 * Using constants prevents typos and makes it easy to see all available actions.
 */

export const INPUT_ACTIONS = {
	// Movement
	MOVE_FORWARD: "MoveForward",
	MOVE_BACKWARD: "MoveBackward",
	MOVE_LEFT: "MoveLeft",
	MOVE_RIGHT: "MoveRight",

	// Actions
	JUMP: "Jump",
	USE_POWERUP: "UsePowerup",
} as const;

// Type export
export type InputAction = (typeof INPUT_ACTIONS)[keyof typeof INPUT_ACTIONS];

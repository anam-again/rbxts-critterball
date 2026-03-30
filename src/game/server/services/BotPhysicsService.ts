import { OnStart, Service } from "@flamework/core";
import { Workspace } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { BotConfig } from "shared/constants/BotConfig";
import { BotState, BotDifficulty, DifficultySettings } from "shared/types/BotTypes";

const LOG_PREFIX = "[BotPhysicsService]";

@Service()
export class BotPhysicsService implements OnStart {
	private raycastParams: RaycastParams;

	constructor() {
		this.raycastParams = new RaycastParams();
		this.raycastParams.FilterType = Enum.RaycastFilterType.Exclude;
		this.raycastParams.FilterDescendantsInstances = [];
	}

	onStart(): void {
		print(`${LOG_PREFIX} Started`);
	}

	/**
	 * Get difficulty settings for a bot.
	 */
	public getDifficultySettings(difficulty: BotDifficulty): DifficultySettings {
		switch (difficulty) {
			case BotDifficulty.EASY:
				return BotConfig.DIFFICULTY.EASY;
			case BotDifficulty.MEDIUM:
				return BotConfig.DIFFICULTY.MEDIUM;
			case BotDifficulty.HARD:
				return BotConfig.DIFFICULTY.HARD;
			default:
				return BotConfig.DIFFICULTY.MEDIUM;
		}
	}

	/**
	 * Update raycast filter to exclude bot balls.
	 */
	public updateRaycastFilter(botBalls: Model[]): void {
		this.raycastParams.FilterDescendantsInstances = botBalls;
	}

	/**
	 * Check if the bot sphere is grounded.
	 */
	public checkGrounded(sphere: BasePart): boolean {
		const sphereRadius = sphere.Size.X / 2;
		const rayOrigin = sphere.Position;
		const rayDirection = new Vector3(0, -(sphereRadius + BallConfig.GROUND_RAYCAST_DISTANCE), 0);

		const result = Workspace.Raycast(rayOrigin, rayDirection, this.raycastParams);
		return result !== undefined;
	}

	/**
	 * Update bot physics for one frame.
	 * This is the server-side equivalent of CritterballController.onRenderStepped().
	 */
	public updateBotPhysics(botState: BotState, steeringDirection: Vector3, shouldJump: boolean, dt: number): void {
		const sphere = botState.sphere;
		const settings = this.getDifficultySettings(botState.difficulty);

		// Get current velocity
		const velocity = sphere.AssemblyLinearVelocity;
		const horizontalVelocity = new Vector3(velocity.X, 0, velocity.Z);
		const currentSpeed = horizontalVelocity.Magnitude;

		// Calculate base impulse force with difficulty multiplier
		const baseImpulse =
			BallConfig.MOVE_IMPULSE_FORCE * BotConfig.IMPULSE_MULTIPLIER * settings.impulseMultiplier * dt;

		// Apply movement impulse
		if (steeringDirection.Magnitude > 0.1) {
			// Calculate acceleration multiplier based on current speed (same as player)
			let accelerationMultiplier = 1;

			if (currentSpeed < BallConfig.LOW_SPEED_THRESHOLD) {
				// Boost at low speeds
				accelerationMultiplier = BallConfig.LOW_SPEED_MULTIPLIER;
			} else if (currentSpeed > BallConfig.DIMINISHING_RETURNS_START) {
				// Diminishing returns at high speeds
				const speedRatio =
					(currentSpeed - BallConfig.DIMINISHING_RETURNS_START) /
					(BallConfig.MAX_SPEED - BallConfig.DIMINISHING_RETURNS_START);
				accelerationMultiplier = math.max(
					BallConfig.DIMINISHING_RETURNS_MIN,
					1 - speedRatio * (1 - BallConfig.DIMINISHING_RETURNS_MIN),
				);
			}

			// Apply impulse
			const impulse = steeringDirection.mul(baseImpulse * accelerationMultiplier);
			sphere.ApplyImpulse(impulse);

			// Apply rolling torque (perpendicular to movement)
			const torqueAxis = new Vector3(-steeringDirection.Z, 0, steeringDirection.X);
			const torqueForce = BallConfig.ROLL_TORQUE_FORCE * settings.impulseMultiplier * dt;
			sphere.ApplyAngularImpulse(torqueAxis.mul(torqueForce));
		}

		// Apply turning force if moving fast and need to redirect
		// Bots have much stronger turn control than players
		if (currentSpeed > BallConfig.LOW_SPEED_THRESHOLD && steeringDirection.Magnitude > 0.1) {
			const velocityDir = horizontalVelocity.Unit;
			const targetDir = steeringDirection;
			const dot = velocityDir.Dot(targetDir);

			// Only apply turn force if not already going in the right direction
			if (dot < 0.95) {
				// Calculate turn force with bot multipliers
				const turnDirection = targetDir.sub(velocityDir.mul(dot));
				if (turnDirection.Magnitude > 0.001) {
					const baseTurnForce = BallConfig.TURN_FORCE * currentSpeed * BallConfig.TURN_SPEED_FACTOR;
					const botTurnMultiplier = BotConfig.TURN_FORCE_MULTIPLIER * settings.turnMultiplier;
					const turnForce = turnDirection.Unit.mul(baseTurnForce * botTurnMultiplier * dt);
					sphere.ApplyImpulse(turnForce);
				}
			}
		}

		// Speed cap is enforced via diminishing returns on bot's own impulses (above).
		// No hard velocity cap here - external forces (boosts, bouncers) can push past max speed.

		// Apply jump
		if (shouldJump && botState.isGrounded) {
			const jumpImpulse = new Vector3(0, BallConfig.JUMP_IMPULSE_FORCE, 0);
			sphere.ApplyImpulse(jumpImpulse);
		}
	}

	/**
	 * Zero the velocity of a bot sphere.
	 */
	public zeroVelocity(sphere: BasePart): void {
		sphere.AssemblyLinearVelocity = Vector3.zero;
		sphere.AssemblyAngularVelocity = Vector3.zero;
	}
}

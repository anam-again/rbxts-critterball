import { Players, Workspace } from "@rbxts/services";
import { RaceGameState } from "shared/types/RaceTypes";

/**
 * Shared ball state that all ball-related controllers can access.
 * This singleton provides the core ball references and state that
 * needs to be shared across CritterballController, BallEffectsController,
 * InteractionsController, and BallPhysicsController.
 *
 * Note: Uses methods instead of getters/setters because roblox-ts
 * does not support JavaScript property accessors.
 */
class BallStateManager {
	// Ball references
	private _ball?: Model;
	private _sphere?: BasePart;
	private _sphereRadius = 0;

	// Common references
	private _camera = Workspace.CurrentCamera!;
	private _player = Players.LocalPlayer;

	// Raycast params (shared)
	private _raycastParams = new RaycastParams();

	// Game state
	private _gameState: RaceGameState = RaceGameState.WAITING;
	private _isFrozen = true;

	// Velocity tracking (needed by multiple systems)
	private _previousVelocity = Vector3.zero;

	constructor() {
		// Initialize raycast params
		this._raycastParams.FilterType = Enum.RaycastFilterType.Exclude;
	}

	// Ball references
	getBall(): Model | undefined {
		return this._ball;
	}

	setBall(value: Model | undefined): void {
		this._ball = value;
	}

	getSphere(): BasePart | undefined {
		return this._sphere;
	}

	setSphere(value: BasePart | undefined): void {
		this._sphere = value;
	}

	getSphereRadius(): number {
		return this._sphereRadius;
	}

	setSphereRadius(value: number): void {
		this._sphereRadius = value;
	}

	// Common references
	getCamera(): Camera {
		return this._camera;
	}

	getPlayer(): Player {
		return this._player;
	}

	getRaycastParams(): RaycastParams {
		return this._raycastParams;
	}

	// Game state
	getGameState(): RaceGameState {
		return this._gameState;
	}

	setGameState(value: RaceGameState): void {
		this._gameState = value;
	}

	getIsFrozen(): boolean {
		return this._isFrozen;
	}

	setIsFrozen(value: boolean): void {
		this._isFrozen = value;
	}

	// Velocity tracking
	getPreviousVelocity(): Vector3 {
		return this._previousVelocity;
	}

	setPreviousVelocity(value: Vector3): void {
		this._previousVelocity = value;
	}

	// Computed properties
	getCurrentVelocity(): Vector3 {
		return this._sphere?.AssemblyLinearVelocity ?? Vector3.zero;
	}

	getHorizontalVelocity(): Vector3 {
		const velocity = this.getCurrentVelocity();
		return new Vector3(velocity.X, 0, velocity.Z);
	}

	getHorizontalSpeed(): number {
		return this.getHorizontalVelocity().Magnitude;
	}

	isReady(): boolean {
		return this._sphere !== undefined;
	}

	/**
	 * Initialize ball references when ball is ready.
	 */
	initializeBall(ball: Model, sphere: BasePart): void {
		this._ball = ball;
		this._sphere = sphere;

		// Calculate sphere radius
		const size = sphere.Size;
		this._sphereRadius = math.min(size.X, size.Y, size.Z) / 2;

		// Update raycast filter
		const filterList: Instance[] = [ball];
		if (this._player.Character) {
			filterList.push(this._player.Character);
		}
		this._raycastParams.FilterDescendantsInstances = filterList;

		// Initialize previous velocity
		this._previousVelocity = sphere.AssemblyLinearVelocity;
	}

	/**
	 * Check if ball is grounded.
	 */
	isGrounded(): boolean {
		if (!this._sphere) return false;

		const origin = this._sphere.Position;
		const rayDistance = this._sphereRadius + 1; // Small buffer
		const direction = new Vector3(0, -rayDistance, 0);

		const result = Workspace.Raycast(origin, direction, this._raycastParams);
		return result !== undefined;
	}

	/**
	 * Store current velocity as previous (call at end of frame).
	 */
	updatePreviousVelocity(): void {
		if (this._sphere) {
			this._previousVelocity = this._sphere.AssemblyLinearVelocity;
		}
	}
}

// Singleton instance
export const BallState = new BallStateManager();

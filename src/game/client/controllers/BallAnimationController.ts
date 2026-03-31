import { Controller, OnStart } from "@flamework/core";
import { RunService, Workspace } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { PART_NAMES } from "shared/constants/PartNames";

/**
 * Animation state for a single ball's character.
 */
interface BallAnimationState {
	ball: Model;
	sphere: BasePart;
	animator: Animator;
	idleTrack: AnimationTrack;
	runTrack: AnimationTrack;
	fastTrack: AnimationTrack;
	currentAnimation: "idle" | "run" | "fast";
}

/**
 * Handles character animations for all balls (players + bots).
 * Animations change based on ball speed with smooth crossfading.
 *
 * Speed thresholds (using display speed):
 * - 0-100: Idle animation
 * - 100-300: Run animation
 * - 300+: Fast animation
 */
@Controller()
export class BallAnimationController implements OnStart {
	private trackedBalls = new Map<string, BallAnimationState>();

	// Animation instances (created per-rig-type)
	private r15IdleAnimation?: Animation;
	private r15RunAnimation?: Animation;
	private r6IdleAnimation?: Animation;
	private r6RunAnimation?: Animation;
	private fastAnimation?: Animation;

	onStart(): void {
		// Create animation instances for both rig types
		this.createAnimationInstances();

		// Scan for existing balls
		this.scanForBalls();

		// Listen for new balls
		Workspace.ChildAdded.Connect((child) => {
			if (child.IsA("Model") && this.isBallModel(child.Name)) {
				this.initializeBallAnimations(child);
			}
		});

		// Listen for ball removal
		Workspace.ChildRemoved.Connect((child) => {
			if (child.IsA("Model")) {
				this.cleanupBall(child.Name);
			}
		});

		// Update animations each frame
		RunService.RenderStepped.Connect((dt) => this.onRenderStepped(dt));
	}

	private createAnimationInstances(): void {
		// R15 animations
		this.r15IdleAnimation = new Instance("Animation");
		this.r15IdleAnimation.AnimationId = BallConfig.ANIM_R15_IDLE_ID;

		this.r15RunAnimation = new Instance("Animation");
		this.r15RunAnimation.AnimationId = BallConfig.ANIM_R15_RUN_ID;

		// R6 animations
		this.r6IdleAnimation = new Instance("Animation");
		this.r6IdleAnimation.AnimationId = BallConfig.ANIM_R6_IDLE_ID;

		this.r6RunAnimation = new Instance("Animation");
		this.r6RunAnimation.AnimationId = BallConfig.ANIM_R6_RUN_ID;

		// Fast animation (should work with the rig it was made for)
		this.fastAnimation = new Instance("Animation");
		this.fastAnimation.AnimationId = BallConfig.ANIM_FAST_ID;
	}

	private isR15Rig(character: Model): boolean {
		// R15 has UpperTorso, R6 has Torso
		return character.FindFirstChild("UpperTorso") !== undefined;
	}

	private isBallModel(name: string): boolean {
		return name.sub(1, 5) === "Ball_" || name.sub(1, 4) === "Bot_";
	}

	private scanForBalls(): void {
		for (const child of Workspace.GetChildren()) {
			if (child.IsA("Model") && this.isBallModel(child.Name)) {
				this.initializeBallAnimations(child);
			}
		}
	}

	private initializeBallAnimations(ball: Model): void {
		// Prevent duplicate initialization
		if (this.trackedBalls.has(ball.Name)) return;

		// Mark as initializing to prevent race conditions
		this.trackedBalls.set(ball.Name, undefined as unknown as BallAnimationState);

		task.spawn(() => {
			// Wait for sphere
			const sphere = ball.WaitForChild(PART_NAMES.SPHERE, 10) as BasePart | undefined;
			if (!sphere || !ball.Parent) {
				this.trackedBalls.delete(ball.Name);
				return;
			}

			// Wait for character to be available
			// For bots: wait for BotCharacter child
			// For players: wait for BallConstraint on sphere
			const character = this.waitForCharacter(ball, sphere);
			if (!character) {
				this.trackedBalls.delete(ball.Name);
				return;
			}

			// Find or create animator
			const humanoid = character.FindFirstChildOfClass("Humanoid");
			if (!humanoid) {
				this.trackedBalls.delete(ball.Name);
				return;
			}

			let animator = humanoid.FindFirstChildOfClass("Animator");
			if (!animator) {
				animator = new Instance("Animator");
				animator.Parent = humanoid;
			}

			// Detect rig type and select appropriate animations
			const isR15 = this.isR15Rig(character);
			const idleAnimation = isR15 ? this.r15IdleAnimation : this.r6IdleAnimation;
			const runAnimation = isR15 ? this.r15RunAnimation : this.r6RunAnimation;

			// Load animation tracks
			if (!idleAnimation || !runAnimation || !this.fastAnimation) {
				this.trackedBalls.delete(ball.Name);
				return;
			}

			const idleTrack = animator.LoadAnimation(idleAnimation);
			const runTrack = animator.LoadAnimation(runAnimation);
			const fastTrack = animator.LoadAnimation(this.fastAnimation);

			// Configure tracks
			idleTrack.Looped = true;
			runTrack.Looped = true;
			fastTrack.Looped = true;

			// Set animation priority to ensure they play
			idleTrack.Priority = Enum.AnimationPriority.Movement;
			runTrack.Priority = Enum.AnimationPriority.Movement;
			fastTrack.Priority = Enum.AnimationPriority.Movement;

			// Start with idle playing
			idleTrack.Play(0.1);

			const state: BallAnimationState = {
				ball,
				sphere,
				animator,
				idleTrack,
				runTrack,
				fastTrack,
				currentAnimation: "idle",
			};

			this.trackedBalls.set(ball.Name, state);
		});
	}

	private waitForCharacter(ball: Model, sphere: BasePart): Model | undefined {
		const maxWaitTime = 10;
		const startTime = tick();

		while (tick() - startTime < maxWaitTime) {
			if (!ball.Parent) return undefined;

			const character = this.findCharacterInBall(ball, sphere);
			if (character) return character;

			task.wait(0.1);
		}

		return undefined;
	}

	private findCharacterInBall(ball: Model, sphere: BasePart): Model | undefined {
		// For bots, look for "BotCharacter" child
		const botCharacter = ball.FindFirstChild("BotCharacter") as Model | undefined;
		if (botCharacter && botCharacter.IsA("Model")) {
			return botCharacter;
		}

		// For players, the character is attached via RigidConstraint but NOT parented to ball
		// Find the BallConstraint on the sphere and trace back to the character
		const constraint = sphere.FindFirstChild(PART_NAMES.BALL_CONSTRAINT) as RigidConstraint | undefined;
		if (!constraint) return undefined;

		// Attachment1 is on the HumanoidRootPart, its parent is the character
		const charAttachment = constraint.Attachment1;
		if (!charAttachment) return undefined;

		const humanoidRootPart = charAttachment.Parent as BasePart | undefined;
		if (!humanoidRootPart) return undefined;

		const character = humanoidRootPart.Parent as Model | undefined;
		if (character && character.IsA("Model")) {
			return character;
		}

		return undefined;
	}

	private cleanupBall(ballName: string): void {
		const state = this.trackedBalls.get(ballName);
		if (state) {
			// Stop all tracks
			state.idleTrack.Stop(0);
			state.runTrack.Stop(0);
			state.fastTrack.Stop(0);
		}
		this.trackedBalls.delete(ballName);
	}

	private onRenderStepped(dt: number): void {
		for (const [ballName, state] of this.trackedBalls) {
			if (!state || !state.sphere || !state.sphere.Parent) {
				continue;
			}

			this.updateBallAnimation(state, dt);
		}
	}

	private updateBallAnimation(state: BallAnimationState, _dt: number): void {
		// Calculate display speed
		const velocity = state.sphere.AssemblyLinearVelocity;
		const horizontalSpeed = new Vector3(velocity.X, 0, velocity.Z).Magnitude;
		const displaySpeed = horizontalSpeed * BallConfig.SPEED_DISPLAY_MULTIPLIER;

		// Determine which animation should play
		let targetAnimation: "idle" | "run" | "fast";
		if (displaySpeed < BallConfig.ANIM_SPEED_IDLE_MAX) {
			targetAnimation = "idle";
		} else if (displaySpeed < BallConfig.ANIM_SPEED_RUN_MAX) {
			targetAnimation = "run";
		} else {
			targetAnimation = "fast";
		}

		// Switch animation if needed (with crossfade)
		if (targetAnimation !== state.currentAnimation) {
			const fadeTime = BallConfig.ANIM_CROSSFADE_TIME;

			// Stop current animation
			if (state.currentAnimation === "idle") {
				state.idleTrack.Stop(fadeTime);
			} else if (state.currentAnimation === "run") {
				state.runTrack.Stop(fadeTime);
			} else {
				state.fastTrack.Stop(fadeTime);
			}

			// Play new animation
			if (targetAnimation === "idle") {
				state.idleTrack.Play(fadeTime);
			} else if (targetAnimation === "run") {
				state.runTrack.Play(fadeTime);
			} else {
				state.fastTrack.Play(fadeTime);
			}

			state.currentAnimation = targetAnimation;
		}
	}
}

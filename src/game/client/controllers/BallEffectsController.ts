import { Controller, OnStart } from "@flamework/core";
import { Lighting, RunService, Workspace } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { ClientEvents } from "game/client/network";
import { BallState } from "game/client/state/BallState";
import { PART_NAMES } from "shared/constants/PartNames";
import { EFFECT_NAMES, PARTICLE_NAMES } from "shared/constants/UINames";

/**
 * Per-ball effect state for tracking all balls (player + bot).
 */
interface BallEffectState {
	ball: Model;
	sphere: BasePart;
	trails: Trail[];
	neonGlow?: BasePart;
	peakSpeed: number;
	previousVelocity: Vector3;
}

/**
 * Handles all visual effects for the ball:
 * - Trail dynamics
 * - Rolling dust particles
 * - Impact particles
 * - Screen shake
 * - FOV changes
 * - Camera trailing
 * - Impact blur
 * - Color correction (saturation)
 * - Neon glow
 */
@Controller()
export class BallEffectsController implements OnStart {
	// Track ALL balls (players + bots)
	private trackedBalls = new Map<string, BallEffectState>();
	private trailDecayRate = 20;

	// Impact particles
	private impactParticleTemplate?: ParticleEmitter;

	// Rolling dust
	private rollingDustAttachment?: Attachment;
	private rollingDustEmitter?: ParticleEmitter;
	private lastDustRaycastTime = 0;
	private cachedGroundColor?: Color3;
	private readonly DUST_RAYCAST_INTERVAL = 0.1; // 100ms throttle

	// Screen shake
	private shakeIntensity = 0;
	private shakeTime = 0;

	// FOV
	private currentFOV: number = BallConfig.FOV_BASE;

	// Camera trailing
	private cameraTrailOffset = Vector3.zero;

	// Impact blur
	private impactBlurEffect?: BlurEffect;
	private impactBlurIntensity = 0;

	// Color correction (saturation)
	private colorCorrectionEffect?: ColorCorrectionEffect;
	private currentSaturation = 0;

	// Neon glow
	private neonGlow?: BasePart;
	private neonGlowFlashTime = 0;
	private neonGlowIsFlashing = false;
	private isInsideAnyBoostZone = false;
	private currentNeonGlowTransparency = 1.0;

	onStart(): void {
		// Create lighting effects
		this.createImpactBlurEffect();
		this.createColorCorrectionEffect();

		// Scan for existing balls
		this.scanForBalls();

		// Listen for new balls added to workspace
		Workspace.ChildAdded.Connect((child) => {
			if (child.IsA("Model") && this.isBallModel(child.Name)) {
				this.initializeBallEffects(child);
			}
		});

		// Listen for ball removal
		Workspace.ChildRemoved.Connect((child) => {
			if (child.IsA("Model")) {
				this.trackedBalls.delete(child.Name);
			}
		});

		// Listen for local player ball ready (for local player-specific setup)
		ClientEvents.ballReady.connect((ball) => {
			this.onBallReady(ball);
		});

		// Start render loop
		RunService.RenderStepped.Connect((dt) => this.onRenderStepped(dt));
	}

	// ============================================
	// Ball Tracking
	// ============================================

	private isBallModel(name: string): boolean {
		return name.sub(1, 5) === "Ball_" || name.sub(1, 4) === "Bot_";
	}

	private scanForBalls(): void {
		for (const child of Workspace.GetChildren()) {
			if (child.IsA("Model") && this.isBallModel(child.Name)) {
				this.initializeBallEffects(child);
			}
		}
	}

	private initializeBallEffects(ball: Model): void {
		// Skip if already tracked
		if (this.trackedBalls.has(ball.Name)) return;

		// Mark as being initialized to prevent duplicate initialization
		this.trackedBalls.set(ball.Name, undefined as unknown as BallEffectState);

		// Wait for sphere asynchronously (it may not have replicated yet)
		task.spawn(() => {
			const sphere = ball.WaitForChild(PART_NAMES.SPHERE, 10) as BasePart | undefined;
			if (!sphere) {
				this.trackedBalls.delete(ball.Name);
				return;
			}

			// Ball may have been removed while waiting
			if (!ball.Parent) {
				this.trackedBalls.delete(ball.Name);
				return;
			}

			// Create state now that we have the sphere
			const state: BallEffectState = {
				ball,
				sphere,
				trails: [],
				neonGlow: undefined,
				peakSpeed: 0,
				previousVelocity: Vector3.zero,
			};
			this.trackedBalls.set(ball.Name, state);

			// Now wait for TrailAnchor
			this.waitForTrails(ball, state);

			// And wait for NeonGlow
			this.waitForNeonGlow(ball, state);
		});
	}

	private waitForTrails(ball: Model, state: BallEffectState): void {
		task.spawn(() => {
			const trailAnchor = ball.WaitForChild(PART_NAMES.TRAIL_ANCHOR, 10) as Part | undefined;
			if (!trailAnchor) return;

			// Ball may have been removed while waiting
			if (!this.trackedBalls.has(ball.Name)) return;

			// Wait a moment for children to replicate
			task.wait(0.1);

			// Collect trails
			let trails: Trail[] = [];
			for (const child of trailAnchor.GetChildren()) {
				if (child.IsA("Trail")) trails.push(child);
			}

			if (trails.size() === 0) {
				// Wait for any Trail to be added via ChildAdded
				const connection = trailAnchor.ChildAdded.Connect((child) => {
					if (child.IsA("Trail")) {
						trails.push(child);
					}
				});

				// Wait up to 5 seconds for trails to appear
				const startTime = tick();
				while (trails.size() === 0 && tick() - startTime < 5) {
					task.wait(0.1);
					// Also check current children in case we missed the event
					for (const child of trailAnchor.GetChildren()) {
						if (child.IsA("Trail") && !trails.includes(child)) {
							trails.push(child);
						}
					}
				}
				connection.Disconnect();
			}

			// Update state with trails
			const currentState = this.trackedBalls.get(ball.Name);
			if (currentState) {
				currentState.trails = trails;
			}
		});
	}

	private waitForNeonGlow(ball: Model, state: BallEffectState): void {
		task.spawn(() => {
			// Give the ball model time to fully replicate
			task.wait(0.2);

			// Ball may have been removed while waiting
			if (!this.trackedBalls.has(ball.Name)) return;

			// Find neon glow (recursive search)
			const neonGlow = ball.FindFirstChild(PART_NAMES.NEON_GLOW, true) as BasePart | undefined;

			if (neonGlow) {
				neonGlow.Transparency = 1;
				const currentState = this.trackedBalls.get(ball.Name);
				if (currentState) {
					currentState.neonGlow = neonGlow;
				}
			}
		});
	}

	private onBallReady(ball: Model): void {
		// Initialize in tracked balls system
		this.initializeBallEffects(ball);

		// Get NeonGlow reference for local player (for flash effects triggered by interactions)
		this.neonGlow = ball.FindFirstChild(PART_NAMES.NEON_GLOW) as BasePart | undefined;
		if (this.neonGlow) {
			this.neonGlow.Transparency = 1;
		}

		// Create particle templates (local player only)
		this.createImpactParticleTemplate();
		this.createRollingDustEmitter(ball);
	}

	private onRenderStepped(dt: number): void {
		// Update effects for ALL tracked balls (players + bots)
		for (const [ballName, state] of this.trackedBalls) {
			// Skip if state is not yet initialized (placeholder while waiting for sphere)
			if (!state || !state.sphere) continue;
			this.updateBallEffects(state, dt);
		}

		// Local player-only effects (screen shake, FOV, camera, blur, saturation)
		if (BallState.isReady()) {
			const currentSpeed = BallState.getHorizontalSpeed();
			const grounded = BallState.isGrounded();
			const velocity = BallState.getCurrentVelocity();

			// Update rolling dust (local player only - uses raycast)
			this.updateRollingDust(currentSpeed, grounded);

			// Detect impacts (local player only - screen shake/blur)
			this.detectImpact(velocity);

			// Update speed-based shake
			this.updateSpeedShake(currentSpeed);

			// Apply screen shake
			this.updateScreenShake(dt);

			// Update FOV
			this.updateFOV(currentSpeed, dt);

			// Update camera trailing
			this.updateCameraTrail(velocity, dt);

			// Update impact blur
			this.updateImpactBlur(dt);

			// Update color correction
			this.updateColorCorrection(currentSpeed, dt);
		}
	}

	/**
	 * Update visual effects for any ball (player or bot).
	 */
	private updateBallEffects(state: BallEffectState, dt: number): void {
		const velocity = state.sphere.AssemblyLinearVelocity;
		const horizontalSpeed = new Vector3(velocity.X, 0, velocity.Z).Magnitude;

		// Update trail
		this.updateTrailForBall(state, horizontalSpeed, dt);

		// Update neon glow
		this.updateNeonGlowForBall(state, horizontalSpeed, dt);

		// Store previous velocity for potential future use
		state.previousVelocity = velocity;
	}

	/**
	 * Update trail properties for any ball based on speed.
	 */
	private updateTrailForBall(state: BallEffectState, currentSpeed: number, dt: number): void {
		if (state.trails.size() === 0) return;

		// Update peak speed with decay
		if (currentSpeed > state.peakSpeed) {
			state.peakSpeed = currentSpeed;
		} else {
			state.peakSpeed = math.max(0, state.peakSpeed - this.trailDecayRate * dt);
		}

		// Calculate trail properties
		const transparency = this.getScaledEffectValue(
			state.peakSpeed,
			BallConfig.TRAIL_SPEED_SOFT_MAX,
			BallConfig.TRAIL_SPEED_HARD_MAX,
			BallConfig.TRAIL_MIN_TRANSPARENCY,
			BallConfig.TRAIL_SOFT_MAX_TRANSPARENCY,
			BallConfig.TRAIL_HARD_MAX_TRANSPARENCY,
		);
		const width = this.getScaledEffectValue(
			state.peakSpeed,
			BallConfig.TRAIL_SPEED_SOFT_MAX,
			BallConfig.TRAIL_SPEED_HARD_MAX,
			BallConfig.TRAIL_MIN_WIDTH,
			BallConfig.TRAIL_SOFT_MAX_WIDTH,
			BallConfig.TRAIL_HARD_MAX_WIDTH,
		);
		const lifetime = this.getScaledEffectValue(
			state.peakSpeed,
			BallConfig.TRAIL_SPEED_SOFT_MAX,
			BallConfig.TRAIL_SPEED_HARD_MAX,
			BallConfig.TRAIL_MIN_LIFETIME,
			BallConfig.TRAIL_SOFT_MAX_LIFETIME,
			BallConfig.TRAIL_HARD_MAX_LIFETIME,
		);
		const speedRatio = math.clamp(state.peakSpeed / BallConfig.TRAIL_SPEED_SOFT_MAX, 0, 1);
		const maxLength = this.lerp(BallConfig.TRAIL_MIN_MAX_LENGTH, BallConfig.TRAIL_MAX_MAX_LENGTH, speedRatio);

		// Create sequences
		const transparencySequence = new NumberSequence([
			new NumberSequenceKeypoint(0, transparency),
			new NumberSequenceKeypoint(1, 1),
		]);
		const widthSequence = new NumberSequence([
			new NumberSequenceKeypoint(0, width),
			new NumberSequenceKeypoint(1, 0),
		]);

		// Apply to trails
		for (const trail of state.trails) {
			trail.Transparency = transparencySequence;
			trail.WidthScale = widthSequence;
			trail.Lifetime = lifetime;
			trail.MaxLength = maxLength;
		}
	}

	/**
	 * Update neon glow for any ball based on speed.
	 */
	private updateNeonGlowForBall(state: BallEffectState, currentSpeed: number, dt: number): void {
		if (!state.neonGlow) return;

		// Calculate target transparency based on speed
		const targetTransparency = this.getSpeedBasedNeonTransparency(currentSpeed);

		// Smooth lerp to target
		const lerpFactor = math.clamp(BallConfig.NEON_GLOW_LERP_SPEED * dt, 0, 1);
		const currentTransparency = state.neonGlow.Transparency;
		state.neonGlow.Transparency = this.lerp(currentTransparency, targetTransparency, lerpFactor);
	}

	// ============================================
	// Rolling Dust
	// ============================================

	private createRollingDustEmitter(ball: Model): void {
		const trailAnchor = ball.FindFirstChild(PART_NAMES.TRAIL_ANCHOR) as Part | undefined;
		if (!trailAnchor) return;

		const attachment = new Instance("Attachment");
		attachment.Name = PART_NAMES.ROLLING_DUST_ATTACHMENT;
		attachment.Position = new Vector3(0, -BallState.getSphereRadius(), 0);
		attachment.Parent = trailAnchor;
		this.rollingDustAttachment = attachment;

		const emitter = new Instance("ParticleEmitter");
		emitter.Name = PARTICLE_NAMES.ROLLING_DUST;
		emitter.Enabled = false;
		emitter.Lifetime = new NumberRange(BallConfig.ROLLING_DUST_LIFETIME * 0.8, BallConfig.ROLLING_DUST_LIFETIME);
		emitter.Speed = new NumberRange(2, 6);
		emitter.SpreadAngle = new Vector2(180, 180);
		emitter.Drag = 4;
		emitter.Rate = 0;
		emitter.RotSpeed = new NumberRange(-90, 90);
		emitter.Rotation = new NumberRange(0, 360);
		emitter.Size = new NumberSequence([
			new NumberSequenceKeypoint(0, 0.1),
			new NumberSequenceKeypoint(0.3, BallConfig.ROLLING_DUST_SIZE),
			new NumberSequenceKeypoint(1, BallConfig.ROLLING_DUST_SIZE * 0.3),
		]);
		emitter.Transparency = new NumberSequence([
			new NumberSequenceKeypoint(0, 0.8),
			new NumberSequenceKeypoint(0.15, 0.3),
			new NumberSequenceKeypoint(0.6, 0.5),
			new NumberSequenceKeypoint(1, 1),
		]);
		emitter.LightEmission = 0;
		emitter.LightInfluence = 1;
		emitter.Color = new ColorSequence(new Color3(0.75, 0.68, 0.55));
		emitter.EmissionDirection = Enum.NormalId.Top;
		emitter.Parent = attachment;
		this.rollingDustEmitter = emitter;
	}

	private updateRollingDust(currentSpeed: number, grounded: boolean): void {
		if (!this.rollingDustEmitter || !this.rollingDustAttachment || !BallState.getSphere()) return;

		if (!grounded || currentSpeed < BallConfig.ROLLING_DUST_MIN_SPEED) {
			this.rollingDustEmitter.Enabled = false;
			return;
		}

		const rate = this.getScaledEffectValue(
			currentSpeed - BallConfig.ROLLING_DUST_MIN_SPEED,
			BallConfig.ROLLING_DUST_SOFT_MAX_SPEED - BallConfig.ROLLING_DUST_MIN_SPEED,
			BallConfig.ROLLING_DUST_HARD_MAX_SPEED - BallConfig.ROLLING_DUST_MIN_SPEED,
			BallConfig.ROLLING_DUST_RATE_MIN,
			BallConfig.ROLLING_DUST_RATE_SOFT_MAX,
			BallConfig.ROLLING_DUST_RATE_HARD_MAX,
		);
		this.rollingDustEmitter.Rate = rate;

		// Throttle ground color raycast to reduce per-frame overhead
		const now = tick();
		if (now - this.lastDustRaycastTime >= this.DUST_RAYCAST_INTERVAL) {
			this.lastDustRaycastTime = now;

			const sphere = BallState.getSphere()!;
			const rayResult = Workspace.Raycast(
				sphere.Position,
				new Vector3(0, -(BallState.getSphereRadius() + 1), 0),
				BallState.getRaycastParams(),
			);

			if (rayResult && rayResult.Instance.IsA("BasePart")) {
				const groundColor = rayResult.Instance.Color;
				this.cachedGroundColor = new Color3(
					math.clamp(groundColor.R + 0.15, 0, 1),
					math.clamp(groundColor.G + 0.12, 0, 1),
					math.clamp(groundColor.B + 0.08, 0, 1),
				);
			}
		}

		// Apply cached ground color if available
		if (this.cachedGroundColor) {
			this.rollingDustEmitter.Color = new ColorSequence(this.cachedGroundColor);
		}

		this.rollingDustEmitter.Enabled = true;
	}

	// ============================================
	// Impact Particles
	// ============================================

	private createImpactParticleTemplate(): void {
		const emitter = new Instance("ParticleEmitter");
		emitter.Name = PARTICLE_NAMES.IMPACT_PARTICLES;
		emitter.Enabled = false;
		emitter.Lifetime = new NumberRange(0.4, 0.8);
		emitter.Speed = new NumberRange(BallConfig.IMPACT_SPEED_MIN, BallConfig.IMPACT_SPEED_MAX);
		emitter.SpreadAngle = new Vector2(60, 60);
		emitter.Drag = 2;
		emitter.Rate = 0;
		emitter.RotSpeed = new NumberRange(-360, 360);
		emitter.Rotation = new NumberRange(0, 360);
		emitter.Texture = "rbxassetid://6490035152";
		emitter.Size = new NumberSequence([
			new NumberSequenceKeypoint(0, BallConfig.IMPACT_SIZE_MIN),
			new NumberSequenceKeypoint(0.2, BallConfig.IMPACT_SIZE_MAX),
			new NumberSequenceKeypoint(1, 0),
		]);
		emitter.Transparency = new NumberSequence([
			new NumberSequenceKeypoint(0, 0),
			new NumberSequenceKeypoint(0.5, 0.3),
			new NumberSequenceKeypoint(1, 1),
		]);
		emitter.LightEmission = 0.8;
		emitter.LightInfluence = 0.2;
		emitter.Color = new ColorSequence(new Color3(1, 1, 1));
		this.impactParticleTemplate = emitter;
	}

	private detectImpact(currentVelocity: Vector3): void {
		const sphere = BallState.getSphere();
		if (!sphere) return;

		const velocityChange = currentVelocity.sub(BallState.getPreviousVelocity());
		const velocityChangeMagnitude = velocityChange.Magnitude;

		if (velocityChangeMagnitude < BallConfig.IMPACT_VELOCITY_THRESHOLD) return;

		const impactDirection = velocityChange.Unit.mul(-1);
		const rayDistance = BallState.getSphereRadius() + 1;
		const rayResult = Workspace.Raycast(
			sphere.Position,
			impactDirection.mul(rayDistance),
			BallState.getRaycastParams(),
		);

		if (rayResult) {
			this.spawnImpactParticles(rayResult.Position, rayResult.Normal, rayResult.Instance, velocityChangeMagnitude);
		}

		this.addImpactShake(velocityChangeMagnitude);
		this.addImpactBlur(velocityChangeMagnitude);
	}

	private spawnImpactParticles(
		position: Vector3,
		normal: Vector3,
		hitPart: BasePart,
		velocityChange: number,
	): void {
		if (!this.impactParticleTemplate) return;

		const impactRatio = math.clamp(
			(velocityChange - BallConfig.IMPACT_VELOCITY_THRESHOLD) /
				(BallConfig.IMPACT_MAX_VELOCITY_CHANGE - BallConfig.IMPACT_VELOCITY_THRESHOLD),
			0,
			1,
		);

		const particleCount = math.floor(
			this.lerp(BallConfig.IMPACT_PARTICLE_COUNT_MIN, BallConfig.IMPACT_PARTICLE_COUNT_MAX, impactRatio),
		);
		const speedMin = this.lerp(BallConfig.IMPACT_SPEED_MIN, BallConfig.IMPACT_SPEED_MAX * 0.6, impactRatio);
		const speedMax = this.lerp(BallConfig.IMPACT_SPEED_MIN * 1.5, BallConfig.IMPACT_SPEED_MAX, impactRatio);
		const sizeStart = this.lerp(BallConfig.IMPACT_SIZE_MIN, BallConfig.IMPACT_SIZE_MAX * 0.8, impactRatio);
		const sizePeak = this.lerp(BallConfig.IMPACT_SIZE_MIN * 1.5, BallConfig.IMPACT_SIZE_MAX, impactRatio);

		const attachment = new Instance("Attachment");
		attachment.WorldCFrame = CFrame.lookAt(position, position.add(normal));
		attachment.Parent = Workspace.Terrain;

		const emitter = this.impactParticleTemplate.Clone();
		emitter.Speed = new NumberRange(speedMin, speedMax);
		emitter.Size = new NumberSequence([
			new NumberSequenceKeypoint(0, sizeStart),
			new NumberSequenceKeypoint(0.2, sizePeak),
			new NumberSequenceKeypoint(1, 0),
		]);

		const surfaceColor = hitPart.Color;
		const brightness = this.lerp(0.7, 1.0, impactRatio);
		const starColor = new Color3(
			math.clamp(surfaceColor.R * 0.5 + brightness * 0.5, 0, 1),
			math.clamp(surfaceColor.G * 0.5 + brightness * 0.5, 0, 1),
			math.clamp(surfaceColor.B * 0.5 + brightness * 0.5, 0, 1),
		);
		emitter.Color = new ColorSequence(starColor);
		emitter.LightEmission = this.lerp(0.5, 1.0, impactRatio);
		emitter.EmissionDirection = Enum.NormalId.Front;
		emitter.Parent = attachment;
		emitter.Emit(particleCount);

		task.delay(1.5, () => {
			attachment.Destroy();
		});
	}

	// ============================================
	// Screen Shake
	// ============================================

	private addImpactShake(velocityChange: number): void {
		const impactRatio = math.clamp(
			(velocityChange - BallConfig.SHAKE_IMPACT_VELOCITY_MIN) /
				(BallConfig.SHAKE_IMPACT_VELOCITY_MAX - BallConfig.SHAKE_IMPACT_VELOCITY_MIN),
			0,
			1,
		);
		const shakeAmount = impactRatio * BallConfig.SHAKE_IMPACT_INTENSITY;
		this.shakeIntensity = math.min(1, this.shakeIntensity + shakeAmount);
	}

	private updateSpeedShake(currentSpeed: number): void {
		if (currentSpeed < BallConfig.SHAKE_SPEED_MIN) return;

		const speedShake = this.getScaledEffectValue(
			currentSpeed - BallConfig.SHAKE_SPEED_MIN,
			BallConfig.SHAKE_SPEED_SOFT_MAX - BallConfig.SHAKE_SPEED_MIN,
			BallConfig.SHAKE_SPEED_HARD_MAX - BallConfig.SHAKE_SPEED_MIN,
			0,
			BallConfig.SHAKE_SPEED_INTENSITY * 0.5,
			BallConfig.SHAKE_SPEED_INTENSITY,
		);
		this.shakeIntensity = math.max(this.shakeIntensity, speedShake);
	}

	private updateScreenShake(dt: number): void {
		const camera = BallState.getCamera();
		if (!camera || this.shakeIntensity <= 0) return;

		this.shakeTime += dt * BallConfig.SHAKE_FREQUENCY;
		const shakeX = math.sin(this.shakeTime * 1.1) * math.cos(this.shakeTime * 0.7);
		const shakeY = math.sin(this.shakeTime * 0.9) * math.cos(this.shakeTime * 1.3);
		const offsetX = shakeX * this.shakeIntensity * 1.2;
		const offsetY = shakeY * this.shakeIntensity * 1.2;

		camera.CFrame = camera.CFrame.mul(new CFrame(offsetX, offsetY, 0));
		this.shakeIntensity = math.max(0, this.shakeIntensity - BallConfig.SHAKE_DECAY_RATE * dt);
	}

	// ============================================
	// FOV
	// ============================================

	private updateFOV(currentSpeed: number, dt: number): void {
		const camera = BallState.getCamera();
		if (!camera) return;

		let targetFOV: number;

		if (currentSpeed <= BallConfig.FOV_SPEED_MIN) {
			targetFOV = BallConfig.FOV_BASE;
		} else if (currentSpeed <= BallConfig.FOV_SPEED_SOFT_MAX) {
			const speedRatio =
				(currentSpeed - BallConfig.FOV_SPEED_MIN) /
				(BallConfig.FOV_SPEED_SOFT_MAX - BallConfig.FOV_SPEED_MIN);
			targetFOV = this.lerp(BallConfig.FOV_BASE, BallConfig.FOV_SOFT_MAX, speedRatio);
		} else {
			const excessSpeed = currentSpeed - BallConfig.FOV_SPEED_SOFT_MAX;
			const maxExcessSpeed = BallConfig.FOV_SPEED_HARD_MAX - BallConfig.FOV_SPEED_SOFT_MAX;
			const diminishingRatio = 1 - math.exp((-3 * excessSpeed) / maxExcessSpeed);
			targetFOV = this.lerp(BallConfig.FOV_SOFT_MAX, BallConfig.FOV_HARD_MAX, diminishingRatio);
		}

		const lerpFactor = math.clamp(BallConfig.FOV_LERP_SPEED * dt, 0, 1);
		this.currentFOV = this.lerp(this.currentFOV, targetFOV, lerpFactor);
		camera.FieldOfView = this.currentFOV;
	}

	// ============================================
	// Camera Trailing
	// ============================================

	private updateCameraTrail(velocity: Vector3, dt: number): void {
		const camera = BallState.getCamera();
		if (!camera) return;

		const targetOffset = velocity.mul(-BallConfig.CAMERA_TRAIL_AMOUNT);
		const clampedTarget =
			targetOffset.Magnitude > BallConfig.CAMERA_TRAIL_MAX_OFFSET
				? targetOffset.Unit.mul(BallConfig.CAMERA_TRAIL_MAX_OFFSET)
				: targetOffset;

		const lerpFactor = math.clamp(BallConfig.CAMERA_TRAIL_LERP_SPEED * dt, 0, 1);
		this.cameraTrailOffset = this.cameraTrailOffset.Lerp(clampedTarget, lerpFactor);

		const localOffset = camera.CFrame.VectorToObjectSpace(this.cameraTrailOffset);
		camera.CFrame = camera.CFrame.mul(new CFrame(localOffset));
	}

	// ============================================
	// Impact Blur
	// ============================================

	private createImpactBlurEffect(): void {
		let blur = Lighting.FindFirstChild(EFFECT_NAMES.IMPACT_BLUR) as BlurEffect | undefined;

		if (!blur) {
			blur = new Instance("BlurEffect");
			blur.Name = EFFECT_NAMES.IMPACT_BLUR;
			blur.Size = 0;
			blur.Parent = Lighting;
		}

		this.impactBlurEffect = blur;
	}

	private addImpactBlur(velocityChange: number): void {
		if (velocityChange < BallConfig.IMPACT_BLUR_VELOCITY_MIN) return;

		const impactRatio = math.clamp(
			(velocityChange - BallConfig.IMPACT_BLUR_VELOCITY_MIN) /
				(BallConfig.IMPACT_BLUR_VELOCITY_MAX - BallConfig.IMPACT_BLUR_VELOCITY_MIN),
			0,
			1,
		);
		const blurAmount = impactRatio * BallConfig.IMPACT_BLUR_SIZE_MAX;
		this.impactBlurIntensity = math.max(this.impactBlurIntensity, blurAmount);
	}

	private updateImpactBlur(dt: number): void {
		if (!this.impactBlurEffect) return;
		this.impactBlurEffect.Size = this.impactBlurIntensity;
		this.impactBlurIntensity = math.max(0, this.impactBlurIntensity - BallConfig.IMPACT_BLUR_DECAY_RATE * dt);
	}

	// ============================================
	// Color Correction
	// ============================================

	private createColorCorrectionEffect(): void {
		let colorCorrection = Lighting.FindFirstChild(EFFECT_NAMES.SPEED_COLOR_CORRECTION) as ColorCorrectionEffect | undefined;

		if (!colorCorrection) {
			colorCorrection = new Instance("ColorCorrectionEffect");
			colorCorrection.Name = EFFECT_NAMES.SPEED_COLOR_CORRECTION;
			colorCorrection.Saturation = 0;
			colorCorrection.Parent = Lighting;
		}

		this.colorCorrectionEffect = colorCorrection;
	}

	private updateColorCorrection(currentSpeed: number, dt: number): void {
		if (!this.colorCorrectionEffect) return;

		const shownSpeed = currentSpeed * BallConfig.SPEED_DISPLAY_MULTIPLIER;
		let targetSaturation: number;

		if (shownSpeed <= BallConfig.SATURATION_SPEED_MIN) {
			targetSaturation = BallConfig.SATURATION_MIN;
		} else if (shownSpeed >= BallConfig.SATURATION_SPEED_MAX) {
			targetSaturation = BallConfig.SATURATION_MAX;
		} else {
			const speedRatio = (shownSpeed - BallConfig.SATURATION_SPEED_MIN) /
				(BallConfig.SATURATION_SPEED_MAX - BallConfig.SATURATION_SPEED_MIN);
			targetSaturation = this.lerp(BallConfig.SATURATION_MIN, BallConfig.SATURATION_MAX, speedRatio);
		}

		const lerpFactor = math.clamp(BallConfig.SATURATION_LERP_SPEED * dt, 0, 1);
		this.currentSaturation = this.lerp(this.currentSaturation, targetSaturation, lerpFactor);
		this.colorCorrectionEffect.Saturation = this.currentSaturation;
	}

	// ============================================
	// Neon Glow
	// ============================================

	/**
	 * Trigger neon glow flash (called externally by interactions).
	 */
	public triggerNeonGlowFlash(): void {
		this.neonGlowIsFlashing = true;
		this.neonGlowFlashTime = 0;
		this.currentNeonGlowTransparency = 0;
		if (this.neonGlow) {
			this.neonGlow.Transparency = 0;
		}
	}

	/**
	 * Set whether ball is inside any boost zone.
	 */
	public setInsideBoostZone(inside: boolean): void {
		this.isInsideAnyBoostZone = inside;
	}

	private getSpeedBasedNeonTransparency(currentSpeed: number): number {
		if (currentSpeed <= BallConfig.NEON_GLOW_SPEED_MIN) {
			return BallConfig.NEON_GLOW_IDLE_TRANSPARENCY;
		} else if (currentSpeed >= BallConfig.NEON_GLOW_SPEED_MAX) {
			return BallConfig.NEON_GLOW_SPEED_MAX_TRANSPARENCY;
		} else {
			const speedRatio = (currentSpeed - BallConfig.NEON_GLOW_SPEED_MIN) /
				(BallConfig.NEON_GLOW_SPEED_MAX - BallConfig.NEON_GLOW_SPEED_MIN);
			return this.lerp(
				BallConfig.NEON_GLOW_IDLE_TRANSPARENCY,
				BallConfig.NEON_GLOW_SPEED_MAX_TRANSPARENCY,
				speedRatio,
			);
		}
	}

	private updateNeonGlow(currentSpeed: number, dt: number): void {
		if (!this.neonGlow) return;

		const speedBasedTransparency = this.getSpeedBasedNeonTransparency(currentSpeed);
		let targetTransparency: number;
		let skipLerp = false;

		if (this.neonGlowIsFlashing) {
			if (this.isInsideAnyBoostZone) {
				targetTransparency = 0;
				skipLerp = true;
				this.neonGlowFlashTime = 0;
			} else {
				this.neonGlowFlashTime += dt;
				if (this.neonGlowFlashTime >= BallConfig.NEON_GLOW_FLASH_DURATION) {
					targetTransparency = speedBasedTransparency;
					this.neonGlowIsFlashing = false;
				} else {
					const progress = this.neonGlowFlashTime / BallConfig.NEON_GLOW_FLASH_DURATION;
					targetTransparency = this.lerp(0, speedBasedTransparency, progress);
				}
			}
		} else {
			targetTransparency = speedBasedTransparency;
		}

		if (skipLerp) {
			this.currentNeonGlowTransparency = targetTransparency;
		} else {
			const lerpFactor = math.clamp(BallConfig.NEON_GLOW_LERP_SPEED * dt, 0, 1);
			this.currentNeonGlowTransparency = this.lerp(this.currentNeonGlowTransparency, targetTransparency, lerpFactor);
		}

		this.neonGlow.Transparency = this.currentNeonGlowTransparency;
	}

	// ============================================
	// Utilities
	// ============================================

	private lerp(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}

	private getScaledEffectValue(
		speed: number,
		softMaxSpeed: number,
		hardMaxSpeed: number,
		minValue: number,
		softMaxValue: number,
		hardMaxValue: number,
	): number {
		if (speed <= 0) return minValue;

		if (speed <= softMaxSpeed) {
			const ratio = speed / softMaxSpeed;
			return this.lerp(minValue, softMaxValue, ratio);
		} else {
			const excessSpeed = speed - softMaxSpeed;
			const maxExcessSpeed = hardMaxSpeed - softMaxSpeed;
			const diminishRatio = 1 - math.exp((-3 * excessSpeed) / maxExcessSpeed);
			return this.lerp(softMaxValue, hardMaxValue, diminishRatio);
		}
	}
}

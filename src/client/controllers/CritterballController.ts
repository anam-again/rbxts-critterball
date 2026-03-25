import { Controller, OnStart } from "@flamework/core";
import { ContextActionService, Lighting, Players, RunService, Workspace } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { ClientEvents } from "client/network";

@Controller()
export class CritterballController implements OnStart {
	private ball?: Model;
	private sphere?: BasePart;
	private sphereRadius = 0;
	private camera = Workspace.CurrentCamera!;
	private player = Players.LocalPlayer;

	// Input state
	private moveForward = false;
	private moveBackward = false;
	private moveLeft = false;
	private moveRight = false;
	private jumpRequested = false;

	// Jump tracking
	private hasJumped = false;

	// Raycast params for ground check
	private raycastParams = new RaycastParams();

	// Trail references
	private trails: Trail[] = [];
	private trailPeakSpeed = 0;
	private trailDecayRate = 20; // How fast the peak speed decays per second

	// Impact detection
	private previousVelocity = Vector3.zero;
	private impactParticleTemplate?: ParticleEmitter;

	// Rolling dust
	private rollingDustAttachment?: Attachment;
	private rollingDustEmitter?: ParticleEmitter;

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

	onStart(): void {
		print("Critterball Client Started!");

		// Setup raycast params
		this.raycastParams.FilterType = Enum.RaycastFilterType.Exclude;

		// Create impact blur effect
		this.createImpactBlurEffect();

		// Listen for ball ready event
		ClientEvents.ballReady.connect((ball) => {
			this.onBallReady(ball);
		});

		// Setup input bindings
		this.setupInput();

		// Start physics loop
		RunService.RenderStepped.Connect((dt) => this.onRenderStepped(dt));
	}

	private onBallReady(ball: Model): void {
		this.ball = ball;
		this.sphere = ball.FindFirstChild("Sphere") as BasePart;

		if (!this.sphere) {
			warn("Ball missing Sphere part!");
			return;
		}

		// Calculate sphere radius (assuming sphere, use smallest dimension / 2)
		const size = this.sphere.Size;
		this.sphereRadius = math.min(size.X, size.Y, size.Z) / 2;

		// Update raycast filter to exclude the ball and player character
		const filterList: Instance[] = [ball];
		if (this.player.Character) {
			filterList.push(this.player.Character);
		}
		this.raycastParams.FilterDescendantsInstances = filterList;

		// Find trail references (wait for TrailAnchor to replicate)
		this.trails = [];
		const trailAnchor = ball.WaitForChild("TrailAnchor", 5) as Part | undefined;
		if (trailAnchor) {
			for (const child of trailAnchor.GetChildren()) {
				if (child.IsA("Trail")) {
					this.trails.push(child);
				}
			}
		}

		// Set camera subject to the sphere for smooth following
		if (this.camera) {
			this.camera.CameraSubject = this.sphere;
		}

		// Create impact particle template
		this.createImpactParticleTemplate();

		// Create rolling dust emitter
		this.createRollingDustEmitter();

		// Initialize previous velocity
		this.previousVelocity = this.sphere.AssemblyLinearVelocity;

		print("Ball ready! Controls active.");
	}

	private createRollingDustEmitter(): void {
		if (!this.sphere || !this.ball) return;

		// Find the TrailAnchor (doesn't rotate with ball)
		const trailAnchor = this.ball.FindFirstChild("TrailAnchor") as Part | undefined;
		if (!trailAnchor) {
			warn("TrailAnchor not found for rolling dust");
			return;
		}

		// Create attachment at ground level on the non-rotating anchor
		const attachment = new Instance("Attachment");
		attachment.Name = "RollingDustAttachment";
		attachment.Position = new Vector3(0, -this.sphereRadius, 0);
		attachment.Parent = trailAnchor;
		this.rollingDustAttachment = attachment;

		// Create dust emitter
		const emitter = new Instance("ParticleEmitter");
		emitter.Name = "RollingDust";
		emitter.Enabled = false;
		emitter.Lifetime = new NumberRange(BallConfig.ROLLING_DUST_LIFETIME * 0.8, BallConfig.ROLLING_DUST_LIFETIME);
		emitter.Speed = new NumberRange(2, 6);
		emitter.SpreadAngle = new Vector2(180, 180); // Emit in all horizontal directions
		emitter.Drag = 4;
		emitter.Rate = 0;
		emitter.RotSpeed = new NumberRange(-90, 90);
		emitter.Rotation = new NumberRange(0, 360);

		// Puff size - grows then shrinks
		emitter.Size = new NumberSequence([
			new NumberSequenceKeypoint(0, 0.1),
			new NumberSequenceKeypoint(0.3, BallConfig.ROLLING_DUST_SIZE),
			new NumberSequenceKeypoint(1, BallConfig.ROLLING_DUST_SIZE * 0.3),
		]);

		// More visible - fade in quickly, stay visible, then fade
		emitter.Transparency = new NumberSequence([
			new NumberSequenceKeypoint(0, 0.8),
			new NumberSequenceKeypoint(0.15, 0.3),
			new NumberSequenceKeypoint(0.6, 0.5),
			new NumberSequenceKeypoint(1, 1),
		]);

		// Subtle dust appearance
		emitter.LightEmission = 0;
		emitter.LightInfluence = 1;

		// Dusty tan color
		emitter.Color = new ColorSequence(new Color3(0.75, 0.68, 0.55));

		// Emit upward from ground
		emitter.EmissionDirection = Enum.NormalId.Top;

		emitter.Parent = attachment;
		this.rollingDustEmitter = emitter;
	}

	private createImpactParticleTemplate(): void {
		const emitter = new Instance("ParticleEmitter");
		emitter.Name = "ImpactParticles";
		emitter.Enabled = false; // We'll emit manually
		emitter.Lifetime = new NumberRange(0.4, 0.8);
		emitter.Speed = new NumberRange(BallConfig.IMPACT_SPEED_MIN, BallConfig.IMPACT_SPEED_MAX);
		emitter.SpreadAngle = new Vector2(60, 60);
		emitter.Drag = 2;
		emitter.Rate = 0;
		emitter.RotSpeed = new NumberRange(-360, 360);
		emitter.Rotation = new NumberRange(0, 360);

		// Star texture
		emitter.Texture = "rbxassetid://6490035152";

		// Size: start at configured size, shrink to zero
		emitter.Size = new NumberSequence([
			new NumberSequenceKeypoint(0, BallConfig.IMPACT_SIZE_MIN),
			new NumberSequenceKeypoint(0.2, BallConfig.IMPACT_SIZE_MAX),
			new NumberSequenceKeypoint(1, 0),
		]);

		// Transparency: visible then fade out
		emitter.Transparency = new NumberSequence([
			new NumberSequenceKeypoint(0, 0),
			new NumberSequenceKeypoint(0.5, 0.3),
			new NumberSequenceKeypoint(1, 1),
		]);

		// Brighter glow for stars
		emitter.LightEmission = 0.8;
		emitter.LightInfluence = 0.2;

		// Default color (will be overridden per impact)
		emitter.Color = new ColorSequence(new Color3(1, 1, 1));

		this.impactParticleTemplate = emitter;
	}

	private setupInput(): void {
		// Forward (W)
		ContextActionService.BindAction(
			"MoveForward",
			(_, state) => {
				this.moveForward = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.W,
		);

		// Backward (S)
		ContextActionService.BindAction(
			"MoveBackward",
			(_, state) => {
				this.moveBackward = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.S,
		);

		// Left (A)
		ContextActionService.BindAction(
			"MoveLeft",
			(_, state) => {
				this.moveLeft = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.A,
		);

		// Right (D)
		ContextActionService.BindAction(
			"MoveRight",
			(_, state) => {
				this.moveRight = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.D,
		);

		// Jump (Space)
		ContextActionService.BindAction(
			"Jump",
			(_, state) => {
				this.jumpRequested = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.Space,
		);
	}

	private onRenderStepped(dt: number): void {
		if (!this.sphere) return;

		// Get current horizontal velocity and speed
		const velocity = this.sphere.AssemblyLinearVelocity;
		const horizontalVelocity = new Vector3(velocity.X, 0, velocity.Z);
		const currentSpeed = horizontalVelocity.Magnitude;

		// Calculate camera-relative movement direction
		const moveDir = this.getMoveDirection();

		if (moveDir.Magnitude > 0) {
			// Calculate acceleration multiplier
			let accelMultiplier = 1;

			if (currentSpeed < BallConfig.LOW_SPEED_THRESHOLD) {
				// Boost at low speeds
				const speedRatio = currentSpeed / BallConfig.LOW_SPEED_THRESHOLD;
				accelMultiplier = BallConfig.LOW_SPEED_MULTIPLIER - (BallConfig.LOW_SPEED_MULTIPLIER - 1) * speedRatio;
			} else if (currentSpeed > BallConfig.DIMINISHING_RETURNS_START) {
				// Diminishing returns at high speeds
				const excessSpeed = currentSpeed - BallConfig.DIMINISHING_RETURNS_START;
				const maxExcessSpeed = BallConfig.MAX_SPEED - BallConfig.DIMINISHING_RETURNS_START;
				// Exponential decay: approaches min multiplier as speed approaches max
				const diminishRatio = 1 - math.exp((-3 * excessSpeed) / maxExcessSpeed);
				accelMultiplier = 1 - (1 - BallConfig.DIMINISHING_RETURNS_MIN) * diminishRatio;
			}

			// Only apply forward impulse if under max speed
			if (currentSpeed < BallConfig.MAX_SPEED) {
				const impulse = moveDir.mul(BallConfig.MOVE_IMPULSE_FORCE * accelMultiplier * dt);
				this.sphere.ApplyImpulse(impulse);
			}

			// Apply turning force to redirect velocity
			if (currentSpeed > 1) {
				const currentDir = horizontalVelocity.Unit;
				const turnAmount = 1 - moveDir.Dot(currentDir); // 0 when same dir, 2 when opposite

				if (turnAmount > 0.1) {
					// Calculate the perpendicular component we want to add
					const desiredVelocity = moveDir.mul(currentSpeed * BallConfig.TURN_SPEED_FACTOR);
					const velocityDiff = desiredVelocity.sub(horizontalVelocity);
					const turnImpulse = velocityDiff.mul(BallConfig.TURN_FORCE * dt * turnAmount);
					this.sphere.ApplyImpulse(turnImpulse);
				}
			}

			// Apply angular impulse to make ball roll
			const rollAxis = moveDir.Cross(Vector3.yAxis);
			const angularImpulse = rollAxis.mul(BallConfig.ROLL_TORQUE_FORCE * dt);
			this.sphere.ApplyAngularImpulse(angularImpulse);
		}

		// Apply speed cap by dampening if over max
		if (currentSpeed > BallConfig.MAX_SPEED) {
			const excessRatio = BallConfig.MAX_SPEED / currentSpeed;
			const clampedHorizontal = horizontalVelocity.mul(excessRatio);
			this.sphere.AssemblyLinearVelocity = new Vector3(clampedHorizontal.X, velocity.Y, clampedHorizontal.Z);
		}

		// Apply velocity damping (natural slowdown)
		if (currentSpeed > 0.1) {
			const dampingFactor = 1 - BallConfig.VELOCITY_DAMPING * dt;
			const dampedHorizontal = horizontalVelocity.mul(dampingFactor);
			this.sphere.AssemblyLinearVelocity = new Vector3(dampedHorizontal.X, velocity.Y, dampedHorizontal.Z);
		}

		// Handle jumping
		const grounded = this.isGrounded();

		// Reset jump when touching ground
		if (grounded) {
			this.hasJumped = false;
		}

		if (this.jumpRequested) {
			if (grounded && !this.hasJumped) {
				const jumpImpulse = new Vector3(0, BallConfig.JUMP_IMPULSE_FORCE, 0);
				this.sphere.ApplyImpulse(jumpImpulse);
				this.hasJumped = true;
			}

			this.jumpRequested = false;
		}

		// Update trail based on speed
		this.updateTrailForSpeed(currentSpeed, dt);

		// Update rolling dust
		this.updateRollingDust(currentSpeed, grounded);

		// Detect and handle impacts
		this.detectImpact(velocity);

		// Add speed-based shake
		this.updateSpeedShake(currentSpeed);

		// Apply and decay screen shake
		this.updateScreenShake(dt);

		// Update FOV based on speed
		this.updateFOV(currentSpeed, dt);

		// Update camera trailing
		this.updateCameraTrail(velocity, dt);

		// Update impact blur
		this.updateImpactBlur(dt);

		// Store velocity for next frame
		this.previousVelocity = velocity;
	}

	private getMoveDirection(): Vector3 {
		if (!this.camera) return Vector3.zero;

		// Get camera vectors (flattened to horizontal plane)
		const camLook = this.camera.CFrame.LookVector;
		const forward = new Vector3(camLook.X, 0, camLook.Z).Unit;
		const right = new Vector3(this.camera.CFrame.RightVector.X, 0, this.camera.CFrame.RightVector.Z).Unit;

		// Combine based on input
		let direction = Vector3.zero;

		if (this.moveForward) {
			direction = direction.add(forward);
		}
		if (this.moveBackward) {
			direction = direction.sub(forward);
		}
		if (this.moveRight) {
			direction = direction.add(right);
		}
		if (this.moveLeft) {
			direction = direction.sub(right);
		}

		// Normalize if moving
		if (direction.Magnitude > 0) {
			direction = direction.Unit;
		}

		return direction;
	}

	private isGrounded(): boolean {
		if (!this.sphere) return false;

		const origin = this.sphere.Position;
		// Raycast from center, distance = radius + small buffer
		const rayDistance = this.sphereRadius + BallConfig.GROUND_RAYCAST_DISTANCE;
		const direction = new Vector3(0, -rayDistance, 0);

		const result = Workspace.Raycast(origin, direction, this.raycastParams);
		return result !== undefined;
	}

	private updateTrailForSpeed(currentSpeed: number, dt: number): void {
		if (this.trails.size() === 0) return;

		// Update peak speed - instantly rise to current speed, but decay gradually
		if (currentSpeed > this.trailPeakSpeed) {
			this.trailPeakSpeed = currentSpeed;
		} else {
			this.trailPeakSpeed = math.max(0, this.trailPeakSpeed - this.trailDecayRate * dt);
		}

		// Calculate speed ratio based on peak speed (0 to 1)
		const speedRatio = math.clamp(this.trailPeakSpeed / BallConfig.TRAIL_SPEED_FOR_MAX_EFFECT, 0, 1);

		// Lerp trail properties based on speed
		const transparency = this.lerp(
			BallConfig.TRAIL_MIN_TRANSPARENCY,
			BallConfig.TRAIL_MAX_TRANSPARENCY,
			speedRatio,
		);
		const width = this.lerp(BallConfig.TRAIL_MIN_WIDTH, BallConfig.TRAIL_MAX_WIDTH, speedRatio);
		const lifetime = this.lerp(BallConfig.TRAIL_MIN_LIFETIME, BallConfig.TRAIL_MAX_LIFETIME, speedRatio);
		const maxLength = this.lerp(BallConfig.TRAIL_MIN_MAX_LENGTH, BallConfig.TRAIL_MAX_MAX_LENGTH, speedRatio);

		// Create number sequences for transparency and width
		const transparencySequence = new NumberSequence([
			new NumberSequenceKeypoint(0, transparency), // Visible at ball (newest)
			new NumberSequenceKeypoint(1, 1), // Fully transparent at end (oldest)
		]);

		const widthSequence = new NumberSequence([
			new NumberSequenceKeypoint(0, width), // Full width at ball (newest)
			new NumberSequenceKeypoint(1, 0), // Zero at end (oldest)
		]);

		// Apply to all trails
		for (const trail of this.trails) {
			trail.Transparency = transparencySequence;
			trail.WidthScale = widthSequence;
			trail.Lifetime = lifetime;
			trail.MaxLength = maxLength;
		}
	}

	private lerp(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}

	private updateRollingDust(currentSpeed: number, grounded: boolean): void {
		if (!this.rollingDustEmitter || !this.rollingDustAttachment || !this.sphere) return;

		// Only emit dust when grounded and moving fast enough
		if (!grounded || currentSpeed < BallConfig.ROLLING_DUST_MIN_SPEED) {
			this.rollingDustEmitter.Enabled = false;
			return;
		}

		// Calculate dust intensity based on speed
		const speedRatio = math.clamp(
			(currentSpeed - BallConfig.ROLLING_DUST_MIN_SPEED) /
				(BallConfig.ROLLING_DUST_MAX_SPEED - BallConfig.ROLLING_DUST_MIN_SPEED),
			0,
			1,
		);

		// Scale emission rate with speed
		const rate = this.lerp(BallConfig.ROLLING_DUST_RATE_MIN, BallConfig.ROLLING_DUST_RATE_MAX, speedRatio);
		this.rollingDustEmitter.Rate = rate;

		// Try to get ground color from raycast
		const rayResult = Workspace.Raycast(
			this.sphere.Position,
			new Vector3(0, -(this.sphereRadius + 1), 0),
			this.raycastParams,
		);

		if (rayResult && rayResult.Instance.IsA("BasePart")) {
			const groundColor = rayResult.Instance.Color;
			// Make dust slightly lighter than ground
			const dustColor = new Color3(
				math.clamp(groundColor.R + 0.15, 0, 1),
				math.clamp(groundColor.G + 0.12, 0, 1),
				math.clamp(groundColor.B + 0.08, 0, 1),
			);
			this.rollingDustEmitter.Color = new ColorSequence(dustColor);
		}

		this.rollingDustEmitter.Enabled = true;
	}

	private detectImpact(currentVelocity: Vector3): void {
		if (!this.sphere) return;

		// Calculate velocity change
		const velocityChange = currentVelocity.sub(this.previousVelocity);
		const velocityChangeMagnitude = velocityChange.Magnitude;

		// Check if impact is significant enough
		if (velocityChangeMagnitude < BallConfig.IMPACT_VELOCITY_THRESHOLD) return;

		// Raycast in the direction opposite to velocity change to find impact point
		const impactDirection = velocityChange.Unit.mul(-1);
		const rayDistance = this.sphereRadius + 1;
		const rayResult = Workspace.Raycast(
			this.sphere.Position,
			impactDirection.mul(rayDistance),
			this.raycastParams,
		);

		if (rayResult) {
			this.spawnImpactParticles(rayResult.Position, rayResult.Normal, rayResult.Instance, velocityChangeMagnitude);
		}

		// Add screen shake from impact
		this.addImpactShake(velocityChangeMagnitude);

		// Add impact blur
		this.addImpactBlur(velocityChangeMagnitude);
	}

	private spawnImpactParticles(
		position: Vector3,
		normal: Vector3,
		hitPart: BasePart,
		velocityChange: number,
	): void {
		if (!this.impactParticleTemplate) return;

		// Calculate impact ratio (0 to 1) based on velocity change
		const impactRatio = math.clamp(
			(velocityChange - BallConfig.IMPACT_VELOCITY_THRESHOLD) /
				(BallConfig.IMPACT_MAX_VELOCITY_CHANGE - BallConfig.IMPACT_VELOCITY_THRESHOLD),
			0,
			1,
		);

		// Scale particle count with impact
		const particleCount = math.floor(
			this.lerp(BallConfig.IMPACT_PARTICLE_COUNT_MIN, BallConfig.IMPACT_PARTICLE_COUNT_MAX, impactRatio),
		);

		// Scale speed with impact
		const speedMin = this.lerp(BallConfig.IMPACT_SPEED_MIN, BallConfig.IMPACT_SPEED_MAX * 0.6, impactRatio);
		const speedMax = this.lerp(BallConfig.IMPACT_SPEED_MIN * 1.5, BallConfig.IMPACT_SPEED_MAX, impactRatio);

		// Scale size with impact
		const sizeStart = this.lerp(BallConfig.IMPACT_SIZE_MIN, BallConfig.IMPACT_SIZE_MAX * 0.8, impactRatio);
		const sizePeak = this.lerp(BallConfig.IMPACT_SIZE_MIN * 1.5, BallConfig.IMPACT_SIZE_MAX, impactRatio);

		// Create a temporary attachment at impact point
		const attachment = new Instance("Attachment");
		attachment.WorldCFrame = CFrame.lookAt(position, position.add(normal));
		attachment.Parent = Workspace.Terrain;

		// Clone and setup emitter
		const emitter = this.impactParticleTemplate.Clone();

		// Scale speed
		emitter.Speed = new NumberRange(speedMin, speedMax);

		// Scale size
		emitter.Size = new NumberSequence([
			new NumberSequenceKeypoint(0, sizeStart),
			new NumberSequenceKeypoint(0.2, sizePeak),
			new NumberSequenceKeypoint(1, 0),
		]);

		// Brighter color at higher impacts, tinted by surface
		const surfaceColor = hitPart.Color;
		const brightness = this.lerp(0.7, 1.0, impactRatio);
		const starColor = new Color3(
			math.clamp(surfaceColor.R * 0.5 + brightness * 0.5, 0, 1),
			math.clamp(surfaceColor.G * 0.5 + brightness * 0.5, 0, 1),
			math.clamp(surfaceColor.B * 0.5 + brightness * 0.5, 0, 1),
		);
		emitter.Color = new ColorSequence(starColor);

		// More glow at higher impacts
		emitter.LightEmission = this.lerp(0.5, 1.0, impactRatio);

		// Emit in direction of normal (away from surface)
		emitter.EmissionDirection = Enum.NormalId.Front;

		emitter.Parent = attachment;

		// Emit particles
		emitter.Emit(particleCount);

		// Clean up after particles fade
		task.delay(1.5, () => {
			attachment.Destroy();
		});
	}

	private addImpactShake(velocityChange: number): void {
		// Calculate shake intensity based on velocity change
		const impactRatio = math.clamp(
			(velocityChange - BallConfig.SHAKE_IMPACT_VELOCITY_MIN) /
				(BallConfig.SHAKE_IMPACT_VELOCITY_MAX - BallConfig.SHAKE_IMPACT_VELOCITY_MIN),
			0,
			1,
		);

		const shakeAmount = impactRatio * BallConfig.SHAKE_IMPACT_INTENSITY;

		// Add to current shake (don't replace, accumulate)
		this.shakeIntensity = math.min(1, this.shakeIntensity + shakeAmount);
	}

	private updateSpeedShake(currentSpeed: number): void {
		// Add continuous subtle shake at high speeds
		if (currentSpeed < BallConfig.SHAKE_SPEED_MIN) return;

		const speedRatio = math.clamp(
			(currentSpeed - BallConfig.SHAKE_SPEED_MIN) /
				(BallConfig.SHAKE_SPEED_MAX - BallConfig.SHAKE_SPEED_MIN),
			0,
			1,
		);

		const speedShake = speedRatio * BallConfig.SHAKE_SPEED_INTENSITY;

		// Keep shake at least at speed-based level
		this.shakeIntensity = math.max(this.shakeIntensity, speedShake);
	}

	private updateScreenShake(dt: number): void {
		if (!this.camera || this.shakeIntensity <= 0) return;

		// Calculate shake offset using noise-like pattern
		this.shakeTime += dt * BallConfig.SHAKE_FREQUENCY;

		const shakeX = math.sin(this.shakeTime * 1.1) * math.cos(this.shakeTime * 0.7);
		const shakeY = math.sin(this.shakeTime * 0.9) * math.cos(this.shakeTime * 1.3);

		const offsetX = shakeX * this.shakeIntensity * 1.2;
		const offsetY = shakeY * this.shakeIntensity * 1.2;

		// Apply shake offset to camera
		this.camera.CFrame = this.camera.CFrame.mul(new CFrame(offsetX, offsetY, 0));

		// Decay shake intensity
		this.shakeIntensity = math.max(0, this.shakeIntensity - BallConfig.SHAKE_DECAY_RATE * dt);
	}

	private updateCameraTrail(velocity: Vector3, dt: number): void {
		if (!this.camera) return;

		// Calculate target offset in world space (opposite to velocity)
		const targetOffset = velocity.mul(-BallConfig.CAMERA_TRAIL_AMOUNT);

		// Clamp to max offset
		const clampedTarget =
			targetOffset.Magnitude > BallConfig.CAMERA_TRAIL_MAX_OFFSET
				? targetOffset.Unit.mul(BallConfig.CAMERA_TRAIL_MAX_OFFSET)
				: targetOffset;

		// Smoothly interpolate current offset toward target (world space)
		const lerpFactor = math.clamp(BallConfig.CAMERA_TRAIL_LERP_SPEED * dt, 0, 1);
		this.cameraTrailOffset = this.cameraTrailOffset.Lerp(clampedTarget, lerpFactor);

		// Convert world space offset to camera local space before applying
		const localOffset = this.camera.CFrame.VectorToObjectSpace(this.cameraTrailOffset);

		// Apply offset to camera
		this.camera.CFrame = this.camera.CFrame.mul(new CFrame(localOffset));
	}

	private updateFOV(currentSpeed: number, dt: number): void {
		if (!this.camera) return;

		let targetFOV: number;

		if (currentSpeed <= BallConfig.FOV_SPEED_MIN) {
			// Below min speed: base FOV
			targetFOV = BallConfig.FOV_BASE;
		} else if (currentSpeed <= BallConfig.FOV_SPEED_SOFT_MAX) {
			// Linear scaling up to soft max
			const speedRatio =
				(currentSpeed - BallConfig.FOV_SPEED_MIN) /
				(BallConfig.FOV_SPEED_SOFT_MAX - BallConfig.FOV_SPEED_MIN);
			targetFOV = this.lerp(BallConfig.FOV_BASE, BallConfig.FOV_SOFT_MAX, speedRatio);
		} else {
			// Diminishing returns above soft max
			const excessSpeed = currentSpeed - BallConfig.FOV_SPEED_SOFT_MAX;
			const maxExcessSpeed = BallConfig.FOV_SPEED_HARD_MAX - BallConfig.FOV_SPEED_SOFT_MAX;

			// Use exponential decay for diminishing returns: 1 - e^(-k*x)
			const diminishingRatio = 1 - math.exp((-3 * excessSpeed) / maxExcessSpeed);

			targetFOV = this.lerp(BallConfig.FOV_SOFT_MAX, BallConfig.FOV_HARD_MAX, diminishingRatio);
		}

		// Smoothly interpolate to target FOV
		const lerpFactor = math.clamp(BallConfig.FOV_LERP_SPEED * dt, 0, 1);
		this.currentFOV = this.lerp(this.currentFOV, targetFOV, lerpFactor);

		// Apply FOV to camera
		this.camera.FieldOfView = this.currentFOV;
	}

	private createImpactBlurEffect(): void {
		let blur = Lighting.FindFirstChild("ImpactBlur") as BlurEffect | undefined;

		if (!blur) {
			blur = new Instance("BlurEffect");
			blur.Name = "ImpactBlur";
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

		// Apply current blur
		this.impactBlurEffect.Size = this.impactBlurIntensity;

		// Decay blur
		this.impactBlurIntensity = math.max(0, this.impactBlurIntensity - BallConfig.IMPACT_BLUR_DECAY_RATE * dt);
	}
}

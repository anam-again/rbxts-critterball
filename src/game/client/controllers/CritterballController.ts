import { Controller, OnStart, Dependency } from "@flamework/core";
import { CollectionService, ContextActionService, Lighting, Players, RunService, Workspace } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { ClientEvents } from "game/client/network";
import { TAGS, SPEED_BOOST_ATTRIBUTES, BOUNCER_ATTRIBUTES } from "shared/globals";
import { PowerupUIController, PowerupType } from "./PowerupUIController";

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
	private powerupPickupParticleTemplate?: ParticleEmitter;

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

	// Speed boost zones
	private boostZoneObjects: BoostZoneObject[] = [];
	private boostZoneParts: BasePart[] = []; // Just the BoostZone parts for overlap detection
	private boostZoneOverlapParams = new OverlapParams();
	private activeBoostZones = new Set<BasePart>(); // Track zone parts we're currently inside
	private boostZoneAnimTime = 0; // Global animation time for boost zones
	private boostZoneFlashState = new Map<BoostZoneObject, { flashTime: number; isFlashing: boolean; isInside: boolean }>(); // Flash state per zone

	// Ball neon glow effect (flashes on boost)
	private neonGlow?: BasePart;
	private neonGlowFlashTime = 0;
	private neonGlowIsFlashing = false;
	private isInsideAnyBoostZone = false;
	private currentNeonGlowTransparency = 1.0; // Current lerped transparency

	// Bouncer system
	private bouncers: Bouncer[] = [];
	private bouncerCooldowns = new Map<Bouncer, number>(); // Track cooldown per bouncer
	private bouncerAnimations = new Map<Bouncer, { startTime: number; phase: "expand" | "shrink"; originalSize: Vector3 }>(); // Animation state
	private bouncerConnections: RBXScriptConnection[] = []; // Store Touched connections for cleanup

	// Powerup system
	private powerupUIController = Dependency<PowerupUIController>();
	private currentPowerup: PowerupType = undefined;
	private speedPowerups: SpeedPowerup[] = [];
	private powerupRespawnTimers = new Map<SpeedPowerup, number>(); // Maps powerup to time it was hidden
	private powerupOriginalState = new Map<SpeedPowerup, Map<BasePart, { transparency: number; canCollide: boolean }>>(); // Original part states
	private powerupConnections: RBXScriptConnection[] = []; // Touched connections for cleanup
	private powerupOriginalCFrames = new Map<SpeedPowerup, CFrame>(); // Original position for animation
	private powerupAnimTime = 0; // Global animation time for powerups

	onStart(): void {
		print("Critterball Client Started!");

		// Setup raycast params
		this.raycastParams.FilterType = Enum.RaycastFilterType.Exclude;

		// Setup boost zone overlap params
		this.boostZoneOverlapParams.FilterType = Enum.RaycastFilterType.Include;

		// Create impact blur effect
		this.createImpactBlurEffect();

		// Setup boost zone tracking
		this.setupBoostZones();

		// Setup bouncer tracking
		this.setupBouncers();

		// Setup speed powerup tracking
		this.setupSpeedPowerups();

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

		// Get NeonGlow reference and set initial transparency to 1 (invisible)
		this.neonGlow = ball.FindFirstChild("NeonGlow") as BasePart | undefined;
		if (this.neonGlow) {
			this.neonGlow.Transparency = 1;
		}

		// Set camera subject to the sphere for smooth following
		if (this.camera) {
			this.camera.CameraSubject = this.sphere;
		}

		// Create impact particle template
		this.createImpactParticleTemplate();

		// Create powerup pickup particle template
		this.createPowerupPickupParticleTemplate();

		// Create rolling dust emitter
		this.createRollingDustEmitter();

		// Initialize previous velocity
		this.previousVelocity = this.sphere.AssemblyLinearVelocity;

		print("Ball ready! Controls active.");
	}

	private setupBoostZones(): void {
		// Get all existing boost zone objects (tagged on the Model)
		const existingZones = CollectionService.GetTagged(TAGS.SPEED_BOOST_ZONE);
		for (const zone of existingZones) {
			this.addBoostZoneObject(zone);
		}

		// Listen for new boost zones added at runtime
		CollectionService.GetInstanceAddedSignal(TAGS.SPEED_BOOST_ZONE).Connect((zone) => {
			this.addBoostZoneObject(zone);
		});

		// Listen for boost zones removed at runtime
		CollectionService.GetInstanceRemovedSignal(TAGS.SPEED_BOOST_ZONE).Connect((zone) => {
			this.removeBoostZoneObject(zone);
		});

		// Update overlap params to include boost zone parts
		this.boostZoneOverlapParams.FilterDescendantsInstances = this.boostZoneParts;
	}

	private addBoostZoneObject(instance: Instance): void {
		// Validate it's a BoostZoneObject model
		if (!instance.IsA("Model")) return;

		const boostZonePart = instance.FindFirstChild("BoostZone") as BasePart | undefined;
		if (!boostZonePart || !boostZonePart.IsA("BasePart")) return;

		const zoneObject = instance as BoostZoneObject;
		this.boostZoneObjects.push(zoneObject);
		this.boostZoneParts.push(boostZonePart);
		this.boostZoneFlashState.set(zoneObject, { flashTime: 0, isFlashing: false, isInside: false });

		// Update overlap params
		this.boostZoneOverlapParams.FilterDescendantsInstances = this.boostZoneParts;
	}

	private removeBoostZoneObject(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const zoneObject = instance as BoostZoneObject;
		const index = this.boostZoneObjects.indexOf(zoneObject);
		if (index !== -1) {
			this.boostZoneObjects.remove(index);
			this.boostZoneFlashState.delete(zoneObject);
		}

		const boostZonePart = instance.FindFirstChild("BoostZone") as BasePart | undefined;
		if (boostZonePart) {
			const partIndex = this.boostZoneParts.indexOf(boostZonePart);
			if (partIndex !== -1) {
				this.boostZoneParts.remove(partIndex);
			}
		}

		// Update overlap params
		this.boostZoneOverlapParams.FilterDescendantsInstances = this.boostZoneParts;
	}

	private getBoostZoneObjectFromPart(part: BasePart): BoostZoneObject | undefined {
		const parent = part.Parent;
		if (parent && parent.IsA("Model")) {
			const index = this.boostZoneObjects.indexOf(parent as BoostZoneObject);
			if (index !== -1) {
				return this.boostZoneObjects[index];
			}
		}
		return undefined;
	}

	private setupBouncers(): void {
		// Get all existing bouncers
		const existingBouncers = CollectionService.GetTagged(TAGS.BOUNCER);
		for (const bouncer of existingBouncers) {
			this.addBouncer(bouncer);
		}

		// Listen for new bouncers added at runtime
		CollectionService.GetInstanceAddedSignal(TAGS.BOUNCER).Connect((bouncer) => {
			this.addBouncer(bouncer);
		});

		// Listen for bouncers removed at runtime
		CollectionService.GetInstanceRemovedSignal(TAGS.BOUNCER).Connect((bouncer) => {
			this.removeBouncer(bouncer);
		});
	}

	private addBouncer(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const bouncer = instance as Bouncer;
		const impactArea = bouncer.FindFirstChild("ImpactArea") as BasePart | undefined;
		const mainBouncer = bouncer.FindFirstChild("MainBouncer") as BasePart | undefined;

		if (!impactArea || !mainBouncer) {
			warn(`Bouncer ${instance.Name} missing ImpactArea or MainBouncer`);
			return;
		}

		this.bouncers.push(bouncer);
		this.bouncerCooldowns.set(bouncer, 0);

		// Connect Touched event on ImpactArea
		const connection = impactArea.Touched.Connect((hit) => {
			this.onBouncerTouched(bouncer, hit);
		});
		this.bouncerConnections.push(connection);
	}

	private removeBouncer(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const bouncer = instance as Bouncer;
		const index = this.bouncers.indexOf(bouncer);
		if (index !== -1) {
			this.bouncers.remove(index);
			this.bouncerCooldowns.delete(bouncer);
			this.bouncerAnimations.delete(bouncer);
		}
	}

	private onBouncerTouched(bouncer: Bouncer, hit: BasePart): void {
		// Only react to our ball's sphere
		if (!this.sphere || hit !== this.sphere) return;

		// Check cooldown
		const now = tick();
		const lastTrigger = this.bouncerCooldowns.get(bouncer) ?? 0;
		if (now - lastTrigger < BallConfig.BOUNCER_COOLDOWN) return;

		// Update cooldown
		this.bouncerCooldowns.set(bouncer, now);

		// Calculate horizontal direction away from bouncer center
		const bouncerCenter = bouncer.MainBouncer.Position;
		const ballPosition = this.sphere.Position;
		const directionAway = new Vector3(
			ballPosition.X - bouncerCenter.X,
			0,
			ballPosition.Z - bouncerCenter.Z,
		);

		// Apply impulse (use unit direction, or default to ball's velocity direction if too close)
		let impulseDirection: Vector3;
		if (directionAway.Magnitude > 0.1) {
			impulseDirection = directionAway.Unit;
		} else {
			// Fallback: push in ball's current velocity direction
			const velocity = this.sphere.AssemblyLinearVelocity;
			const horizontalVel = new Vector3(velocity.X, 0, velocity.Z);
			impulseDirection = horizontalVel.Magnitude > 0.1 ? horizontalVel.Unit : new Vector3(1, 0, 0);
		}

		// Get impulse force from attribute or use default
		const impulseForce = (bouncer.GetAttribute(BOUNCER_ATTRIBUTES.IMPULSE_FORCE) as number | undefined) ??
			BallConfig.BOUNCER_IMPULSE_FORCE;

		const impulse = impulseDirection.mul(impulseForce);
		this.sphere.ApplyImpulse(impulse);

		// Start expand animation
		this.startBouncerAnimation(bouncer);

		// Trigger neon glow flash
		this.triggerNeonGlowFlash();
	}

	private startBouncerAnimation(bouncer: Bouncer): void {
		const mainBouncer = bouncer.MainBouncer;

		// Store original size if not already animating
		const existingAnim = this.bouncerAnimations.get(bouncer);
		const originalSize = existingAnim?.originalSize ?? mainBouncer.Size;

		this.bouncerAnimations.set(bouncer, {
			startTime: tick(),
			phase: "expand",
			originalSize: originalSize,
		});
	}

	private updateBouncerAnimations(dt: number): void {
		const now = tick();

		for (const bouncer of this.bouncers) {
			const anim = this.bouncerAnimations.get(bouncer);
			if (!anim) continue;

			const mainBouncer = bouncer.MainBouncer;
			const elapsed = now - anim.startTime;

			if (anim.phase === "expand") {
				// Expanding phase
				const progress = math.clamp(elapsed / BallConfig.BOUNCER_EXPAND_DURATION, 0, 1);
				const scale = this.lerp(1, BallConfig.BOUNCER_EXPAND_SCALE, progress);
				mainBouncer.Size = anim.originalSize.mul(scale);

				// Transition to shrink phase when expand completes
				if (progress >= 1) {
					anim.phase = "shrink";
					anim.startTime = now;
				}
			} else {
				// Shrinking phase
				const progress = math.clamp(elapsed / BallConfig.BOUNCER_SHRINK_DURATION, 0, 1);
				const scale = this.lerp(BallConfig.BOUNCER_EXPAND_SCALE, 1, progress);
				mainBouncer.Size = anim.originalSize.mul(scale);

				// Animation complete
				if (progress >= 1) {
					mainBouncer.Size = anim.originalSize;
					this.bouncerAnimations.delete(bouncer);
				}
			}
		}
	}

	private applyBoostZones(_dt: number): void {
		if (!this.sphere || this.boostZoneParts.size() === 0) {
			// Not in any zone
			if (this.isInsideAnyBoostZone) {
				this.isInsideAnyBoostZone = false;
				// Start neon glow fade since we left all zones
			}
			return;
		}

		// Check which boost zones the sphere overlaps with
		const overlappingParts = Workspace.GetPartsInPart(this.sphere, this.boostZoneOverlapParams);

		// Track current frame's overlapping zones
		const currentZones = new Set<BasePart>();

		for (const zonePart of overlappingParts) {
			currentZones.add(zonePart);

			// Check if this is a NEW zone entry (wasn't in activeBoostZones before)
			if (!this.activeBoostZones.has(zonePart)) {
				// Get boost force from attribute, or use default
				const boostForce = (zonePart.GetAttribute(SPEED_BOOST_ATTRIBUTES.BOOST_FORCE) as number | undefined) ??
					BallConfig.SPEED_BOOST_DEFAULT_FORCE;

				// Get boost direction from attribute, or use default
				const boostDirectionType = (zonePart.GetAttribute(SPEED_BOOST_ATTRIBUTES.BOOST_DIRECTION) as string | undefined) ??
					BallConfig.SPEED_BOOST_DEFAULT_DIRECTION;

				// Calculate boost direction
				let boostDirection: Vector3;

				if (boostDirectionType === "Velocity") {
					// Boost in the direction the ball is moving
					const velocity = this.sphere.AssemblyLinearVelocity;
					const horizontalVelocity = new Vector3(velocity.X, 0, velocity.Z);
					if (horizontalVelocity.Magnitude > 0.1) {
						boostDirection = horizontalVelocity.Unit;
					} else {
						// If not moving, use zone's forward direction as fallback
						boostDirection = zonePart.CFrame.LookVector;
					}
				} else {
					// "Forward" - use the zone's LookVector
					boostDirection = zonePart.CFrame.LookVector;
				}

				// Apply one-time boost impulse on zone entry
				const impulse = boostDirection.mul(boostForce);
				this.sphere.ApplyImpulse(impulse);

				// Trigger flash effect on the boost zone object (mark as inside)
				const zoneObject = this.getBoostZoneObjectFromPart(zonePart);
				if (zoneObject) {
					this.triggerBoostFlash(zoneObject, true);
				}

				// Trigger neon glow flash on the ball
				this.triggerNeonGlowFlash();
			}
		}

		// Check for zones we've exited
		for (const zonePart of this.activeBoostZones) {
			if (!currentZones.has(zonePart)) {
				// We've left this zone - start fade out
				const zoneObject = this.getBoostZoneObjectFromPart(zonePart);
				if (zoneObject) {
					this.startBoostFadeOut(zoneObject);
				}
			}
		}

		// Update whether we're inside any boost zone (for neon glow)
		const wasInsideAny = this.isInsideAnyBoostZone;
		this.isInsideAnyBoostZone = currentZones.size() > 0;

		// If we just left all zones, the neon glow fade will start in updateNeonGlowFlash
		if (wasInsideAny && !this.isInsideAnyBoostZone) {
			// Neon glow will start fading in updateNeonGlowFlash
		}

		// Update active zones for next frame
		this.activeBoostZones = currentZones;
	}

	private triggerBoostFlash(zoneObject: BoostZoneObject, isInside: boolean): void {
		const state = this.boostZoneFlashState.get(zoneObject);
		if (state) {
			state.isFlashing = true;
			state.isInside = isInside;
			state.flashTime = 0; // Reset fade timer
		}
	}

	private startBoostFadeOut(zoneObject: BoostZoneObject): void {
		const state = this.boostZoneFlashState.get(zoneObject);
		if (state && state.isInside) {
			state.isInside = false;
			state.flashTime = 0; // Start fade out timer
		}
	}

	private triggerNeonGlowFlash(): void {
		this.neonGlowIsFlashing = true;
		this.neonGlowFlashTime = 0;
		this.currentNeonGlowTransparency = 0; // Skip lerp, instantly visible
		if (this.neonGlow) {
			this.neonGlow.Transparency = 0;
		}
	}

	private updateBoostZoneVisuals(dt: number): void {
		// Update global animation time
		this.boostZoneAnimTime += dt;

		for (const zoneObject of this.boostZoneObjects) {
			const flashState = this.boostZoneFlashState.get(zoneObject);
			if (!flashState) continue;

			// Calculate flash intensity (0 = normal, 1 = fully flashed/visible)
			let flashIntensity = 0;

			if (flashState.isFlashing) {
				if (flashState.isInside) {
					// While inside the zone, stay at full intensity
					flashIntensity = 1;
				} else {
					// We've left the zone, run the fade out
					flashState.flashTime += dt;

					const holdDuration = BallConfig.BOOST_FLASH_HOLD_DURATION;
					const fadeDuration = BallConfig.BOOST_FLASH_FADE_DURATION;
					const totalDuration = holdDuration + fadeDuration;

					if (flashState.flashTime < holdDuration) {
						// Brief hold at full visibility after leaving
						flashIntensity = 1;
					} else if (flashState.flashTime < totalDuration) {
						// Fade back to normal
						const fadeProgress = (flashState.flashTime - holdDuration) / fadeDuration;
						flashIntensity = 1 - fadeProgress;
					} else {
						// Flash complete
						flashState.isFlashing = false;
						flashState.flashTime = 0;
						flashIntensity = 0;
					}
				}
			}

			// Update arrows - cycle through them so ONE is invisible and TWO are visible
			// The invisible arrow cycles: Arrow3 -> Arrow2 -> Arrow1 -> repeat (reversed order)
			const cycleProgress = (this.boostZoneAnimTime * BallConfig.BOOST_ARROW_CYCLE_SPEED) % 1; // 0 to 1 within full cycle
			const invisibleArrowIndex = 2 - math.floor(cycleProgress * 3); // Which arrow is currently invisible (2, 1, 0)
			const arrowFadeProgress = (cycleProgress * 3) % 1; // Progress within current arrow's invisible period (0 to 1)

			// Calculate transparency for each arrow
			// The "invisible" arrow fades: visible (0) -> invisible (1) -> visible (0) as it transitions
			// Two arrows are always visible (transparency 0), one fades out then the next fades in
			// When flashing, all arrows become fully visible (transparency 0)
			const getArrowTransparency = (arrowIndex: number): number => {
				if (flashIntensity > 0) {
					// During flash, lerp toward fully visible
					const normalTrans = arrowIndex === invisibleArrowIndex ? arrowFadeProgress : 0;
					return normalTrans * (1 - flashIntensity);
				}
				// Normal: the invisible arrow fades out, others stay visible
				if (arrowIndex === invisibleArrowIndex) {
					return arrowFadeProgress; // Fades from 0 to 1
				}
				// The arrow that was just invisible fades back in
				const prevInvisibleIndex = (invisibleArrowIndex + 1) % 3; // Previous in reversed cycle
				if (arrowIndex === prevInvisibleIndex) {
					return 1 - arrowFadeProgress; // Fades from 1 to 0
				}
				return 0; // Fully visible
			};

			this.setModelTransparency(zoneObject.BoostArrow1, getArrowTransparency(0));
			this.setModelTransparency(zoneObject.BoostArrow2, getArrowTransparency(1));
			this.setModelTransparency(zoneObject.BoostArrow3, getArrowTransparency(2));

			// Update outline - sine wave pulse between low and high transparency
			const outlineSine = math.sin(this.boostZoneAnimTime * BallConfig.BOOST_OUTLINE_PULSE_SPEED * math.pi * 2);
			const outlineIdleTransparency = this.lerp(
				BallConfig.BOOST_OUTLINE_LOW_TRANSPARENCY,
				BallConfig.BOOST_OUTLINE_HIGH_TRANSPARENCY,
				(outlineSine + 1) / 2, // Convert -1,1 to 0,1
			);
			// Flash makes it fully visible (transparency 0)
			const outlineTransparency = outlineIdleTransparency * (1 - flashIntensity);
			this.setModelTransparency(zoneObject.Outline, outlineTransparency);

			// Update body - sine wave pulse between low and high transparency
			const bodySine = math.sin(this.boostZoneAnimTime * BallConfig.BOOST_BODY_PULSE_SPEED * math.pi * 2);
			const bodyIdleTransparency = this.lerp(
				BallConfig.BOOST_BODY_LOW_TRANSPARENCY,
				BallConfig.BOOST_BODY_HIGH_TRANSPARENCY,
				(bodySine + 1) / 2,
			);
			// Flash makes it fully visible (transparency 0)
			const bodyTransparency = bodyIdleTransparency * (1 - flashIntensity);
			zoneObject.Body.Transparency = bodyTransparency;

			// Update colors based on flash intensity
			const bodyColor = this.lerpColor(
				BallConfig.BOOST_BODY_COLOR_IDLE,
				BallConfig.BOOST_BODY_COLOR_FLASH,
				flashIntensity,
			);
			zoneObject.Body.Color = bodyColor;

			const outlineColor = this.lerpColor(
				BallConfig.BOOST_OUTLINE_COLOR_IDLE,
				BallConfig.BOOST_OUTLINE_COLOR_FLASH,
				flashIntensity,
			);
			this.setModelColor(zoneObject.Outline, outlineColor);

			const arrowColor = this.lerpColor(
				BallConfig.BOOST_ARROW_COLOR_IDLE,
				BallConfig.BOOST_ARROW_COLOR_FLASH,
				flashIntensity,
			);
			this.setModelColor(zoneObject.BoostArrow1, arrowColor);
			this.setModelColor(zoneObject.BoostArrow2, arrowColor);
			this.setModelColor(zoneObject.BoostArrow3, arrowColor);
		}
	}

	private lerpColor(
		idle: readonly [number, number, number],
		flash: readonly [number, number, number],
		t: number,
	): Color3 {
		return new Color3(
			this.lerp(idle[0] / 255, flash[0] / 255, t),
			this.lerp(idle[1] / 255, flash[1] / 255, t),
			this.lerp(idle[2] / 255, flash[2] / 255, t),
		);
	}

	private setModelTransparency(model: Model, transparency: number): void {
		for (const descendant of model.GetDescendants()) {
			if (descendant.IsA("BasePart")) {
				descendant.Transparency = transparency;
			}
		}
	}

	private setModelColor(model: Model, color: Color3): void {
		for (const descendant of model.GetDescendants()) {
			if (descendant.IsA("BasePart")) {
				descendant.Color = color;
			}
		}
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

	private createPowerupPickupParticleTemplate(): void {
		const emitter = new Instance("ParticleEmitter");
		emitter.Name = "PowerupPickupParticles";
		emitter.Enabled = false; // We'll emit manually
		emitter.Lifetime = new NumberRange(
			BallConfig.POWERUP_PICKUP_PARTICLE_LIFETIME * 0.7,
			BallConfig.POWERUP_PICKUP_PARTICLE_LIFETIME,
		);
		emitter.Speed = new NumberRange(
			BallConfig.POWERUP_PICKUP_PARTICLE_SPEED_MIN,
			BallConfig.POWERUP_PICKUP_PARTICLE_SPEED_MAX,
		);
		emitter.SpreadAngle = new Vector2(180, 180); // Emit in all directions
		emitter.Drag = 3;
		emitter.Rate = 0;
		emitter.RotSpeed = new NumberRange(-360, 360);
		emitter.Rotation = new NumberRange(0, 360);

		// Star texture
		emitter.Texture = "rbxassetid://6490035152";

		// Size: grow then shrink
		emitter.Size = new NumberSequence([
			new NumberSequenceKeypoint(0, 0.2),
			new NumberSequenceKeypoint(0.15, BallConfig.POWERUP_PICKUP_PARTICLE_SIZE),
			new NumberSequenceKeypoint(1, 0),
		]);

		// Transparency: visible then fade out
		emitter.Transparency = new NumberSequence([
			new NumberSequenceKeypoint(0, 0),
			new NumberSequenceKeypoint(0.4, 0.2),
			new NumberSequenceKeypoint(1, 1),
		]);

		// Bright glow
		emitter.LightEmission = 1;
		emitter.LightInfluence = 0;

		// Golden yellow color from config
		const color = BallConfig.POWERUP_PICKUP_PARTICLE_COLOR;
		emitter.Color = new ColorSequence(new Color3(color[0] / 255, color[1] / 255, color[2] / 255));

		this.powerupPickupParticleTemplate = emitter;
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

		// Use Powerup (E)
		ContextActionService.BindAction(
			"UsePowerup",
			(_, state) => {
				if (state === Enum.UserInputState.Begin) {
					this.usePowerup();
				}
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.E,
		);
	}

	private onRenderStepped(dt: number): void {
		// Update boost zone visuals (always runs, even without ball)
		this.updateBoostZoneVisuals(dt);

		// Update bouncer animations (always runs, even without ball)
		this.updateBouncerAnimations(dt);

		// Update powerup respawns (always runs, even without ball)
		this.updatePowerupRespawns();

		// Update powerup animations (floating and spinning)
		this.updatePowerupAnimations(dt);

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

		// Apply boost zones (external forces that can exceed max speed)
		this.applyBoostZones(dt);

		// Note: No hard speed cap here - MAX_SPEED only limits player input acceleration
		// External forces (like boost zones) can push the ball past MAX_SPEED

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

		// Update neon glow (speed-based + flash effect)
		this.updateNeonGlow(currentSpeed, dt);

		// Store velocity for next frame
		this.previousVelocity = velocity;
	}

	private getSpeedBasedNeonTransparency(currentSpeed: number): number {
		// Calculate speed-based transparency
		if (currentSpeed <= BallConfig.NEON_GLOW_SPEED_MIN) {
			return BallConfig.NEON_GLOW_IDLE_TRANSPARENCY;
		} else if (currentSpeed >= BallConfig.NEON_GLOW_SPEED_MAX) {
			return BallConfig.NEON_GLOW_SPEED_MAX_TRANSPARENCY;
		} else {
			// Linear interpolation between min and max speed
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

		// Calculate what the speed-based transparency should be
		const speedBasedTransparency = this.getSpeedBasedNeonTransparency(currentSpeed);

		let targetTransparency: number;
		let skipLerp = false;

		if (this.neonGlowIsFlashing) {
			if (this.isInsideAnyBoostZone) {
				// While inside any boost zone, immediately jump to full visibility
				targetTransparency = 0;
				skipLerp = true;
				this.neonGlowFlashTime = 0; // Reset timer so fade starts fresh when we leave
			} else {
				// We've left all boost zones, fade from 0 to speed-based transparency
				this.neonGlowFlashTime += dt;

				if (this.neonGlowFlashTime >= BallConfig.NEON_GLOW_FLASH_DURATION) {
					// Flash complete, return to speed-based transparency
					targetTransparency = speedBasedTransparency;
					this.neonGlowIsFlashing = false;
				} else {
					// Fade from 0 to speed-based transparency over the duration
					const progress = this.neonGlowFlashTime / BallConfig.NEON_GLOW_FLASH_DURATION;
					targetTransparency = this.lerp(0, speedBasedTransparency, progress);
				}
			}
		} else {
			// No flash active, just use speed-based transparency
			targetTransparency = speedBasedTransparency;
		}

		if (skipLerp) {
			// Boost: immediately set transparency
			this.currentNeonGlowTransparency = targetTransparency;
		} else {
			// Normal: lerp towards target for smooth transitions
			const lerpFactor = math.clamp(BallConfig.NEON_GLOW_LERP_SPEED * dt, 0, 1);
			this.currentNeonGlowTransparency = this.lerp(this.currentNeonGlowTransparency, targetTransparency, lerpFactor);
		}

		this.neonGlow.Transparency = this.currentNeonGlowTransparency;
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

		// Calculate trail properties using soft/hard max scaling for extreme speeds
		const transparency = this.getScaledEffectValue(
			this.trailPeakSpeed,
			BallConfig.TRAIL_SPEED_SOFT_MAX,
			BallConfig.TRAIL_SPEED_HARD_MAX,
			BallConfig.TRAIL_MIN_TRANSPARENCY,
			BallConfig.TRAIL_SOFT_MAX_TRANSPARENCY,
			BallConfig.TRAIL_HARD_MAX_TRANSPARENCY,
		);
		const width = this.getScaledEffectValue(
			this.trailPeakSpeed,
			BallConfig.TRAIL_SPEED_SOFT_MAX,
			BallConfig.TRAIL_SPEED_HARD_MAX,
			BallConfig.TRAIL_MIN_WIDTH,
			BallConfig.TRAIL_SOFT_MAX_WIDTH,
			BallConfig.TRAIL_HARD_MAX_WIDTH,
		);
		const lifetime = this.getScaledEffectValue(
			this.trailPeakSpeed,
			BallConfig.TRAIL_SPEED_SOFT_MAX,
			BallConfig.TRAIL_SPEED_HARD_MAX,
			BallConfig.TRAIL_MIN_LIFETIME,
			BallConfig.TRAIL_SOFT_MAX_LIFETIME,
			BallConfig.TRAIL_HARD_MAX_LIFETIME,
		);
		const speedRatio = math.clamp(this.trailPeakSpeed / BallConfig.TRAIL_SPEED_SOFT_MAX, 0, 1);
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

	// Helper for soft/hard max scaling: linear up to softMax, then diminishing returns to hardMax
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
			// Linear scaling up to soft max
			const ratio = speed / softMaxSpeed;
			return this.lerp(minValue, softMaxValue, ratio);
		} else {
			// Diminishing returns from soft max to hard max
			const excessSpeed = speed - softMaxSpeed;
			const maxExcessSpeed = hardMaxSpeed - softMaxSpeed;
			// Exponential approach: 1 - e^(-3x) for smooth diminishing returns
			const diminishRatio = 1 - math.exp((-3 * excessSpeed) / maxExcessSpeed);
			return this.lerp(softMaxValue, hardMaxValue, diminishRatio);
		}
	}

	private updateRollingDust(currentSpeed: number, grounded: boolean): void {
		if (!this.rollingDustEmitter || !this.rollingDustAttachment || !this.sphere) return;

		// Only emit dust when grounded and moving fast enough
		if (!grounded || currentSpeed < BallConfig.ROLLING_DUST_MIN_SPEED) {
			this.rollingDustEmitter.Enabled = false;
			return;
		}

		// Scale emission rate with soft/hard max for extreme speeds
		const rate = this.getScaledEffectValue(
			currentSpeed - BallConfig.ROLLING_DUST_MIN_SPEED,
			BallConfig.ROLLING_DUST_SOFT_MAX_SPEED - BallConfig.ROLLING_DUST_MIN_SPEED,
			BallConfig.ROLLING_DUST_HARD_MAX_SPEED - BallConfig.ROLLING_DUST_MIN_SPEED,
			BallConfig.ROLLING_DUST_RATE_MIN,
			BallConfig.ROLLING_DUST_RATE_SOFT_MAX,
			BallConfig.ROLLING_DUST_RATE_HARD_MAX,
		);
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
		// Add continuous subtle shake at high speeds, scaling with soft/hard max
		if (currentSpeed < BallConfig.SHAKE_SPEED_MIN) return;

		// Use soft/hard max scaling for extreme speeds
		const speedShake = this.getScaledEffectValue(
			currentSpeed - BallConfig.SHAKE_SPEED_MIN,
			BallConfig.SHAKE_SPEED_SOFT_MAX - BallConfig.SHAKE_SPEED_MIN,
			BallConfig.SHAKE_SPEED_HARD_MAX - BallConfig.SHAKE_SPEED_MIN,
			0,
			BallConfig.SHAKE_SPEED_INTENSITY * 0.5, // Half intensity at soft max
			BallConfig.SHAKE_SPEED_INTENSITY, // Full intensity at hard max
		);

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

	// ============================================
	// Speed Powerup System
	// ============================================

	private setupSpeedPowerups(): void {
		// Get all existing speed powerups
		const existingPowerups = CollectionService.GetTagged(TAGS.SPEED_POWERUP);
		for (const powerup of existingPowerups) {
			this.addSpeedPowerup(powerup);
		}

		// Listen for new powerups added at runtime
		CollectionService.GetInstanceAddedSignal(TAGS.SPEED_POWERUP).Connect((powerup) => {
			this.addSpeedPowerup(powerup);
		});

		// Listen for powerups removed at runtime
		CollectionService.GetInstanceRemovedSignal(TAGS.SPEED_POWERUP).Connect((powerup) => {
			this.removeSpeedPowerup(powerup);
		});
	}

	private addSpeedPowerup(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const powerup = instance as SpeedPowerup;
		const collisionBox = powerup.FindFirstChild("CollisionBox") as BasePart | undefined;

		if (!collisionBox) {
			warn(`SpeedPowerup ${instance.Name} missing CollisionBox`);
			return;
		}

		this.speedPowerups.push(powerup);

		// Store original state for all parts
		const partStates = new Map<BasePart, { transparency: number; canCollide: boolean }>();
		for (const descendant of powerup.GetDescendants()) {
			if (descendant.IsA("BasePart")) {
				partStates.set(descendant, {
					transparency: descendant.Transparency,
					canCollide: descendant.CanCollide,
				});
			}
		}
		this.powerupOriginalState.set(powerup, partStates);

		// Store original CFrame for animation
		this.powerupOriginalCFrames.set(powerup, powerup.GetPivot());

		// Connect Touched event on CollisionBox
		const connection = collisionBox.Touched.Connect((hit) => {
			this.onSpeedPowerupTouched(powerup, hit);
		});
		this.powerupConnections.push(connection);
	}

	private removeSpeedPowerup(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const powerup = instance as SpeedPowerup;
		const index = this.speedPowerups.indexOf(powerup);
		if (index !== -1) {
			this.speedPowerups.remove(index);
			this.powerupOriginalState.delete(powerup);
			this.powerupRespawnTimers.delete(powerup);
			this.powerupOriginalCFrames.delete(powerup);
		}
	}

	private onSpeedPowerupTouched(powerup: SpeedPowerup, hit: BasePart): void {
		// Only react to our ball's sphere
		if (!this.sphere || hit !== this.sphere) return;

		// Already have a powerup
		if (this.currentPowerup !== undefined) return;

		// Still respawning
		if (this.powerupRespawnTimers.has(powerup)) return;

		// Acquire powerup
		this.currentPowerup = "speed";
		this.powerupUIController.setPowerup("speed");

		// Spawn pickup particles at powerup location
		this.spawnPowerupPickupParticles(powerup.GetPivot().Position);

		// Hide powerup
		this.hideSpeedPowerup(powerup);

		// Schedule respawn
		this.powerupRespawnTimers.set(powerup, tick());
	}

	private hideSpeedPowerup(powerup: SpeedPowerup): void {
		for (const descendant of powerup.GetDescendants()) {
			if (descendant.IsA("BasePart")) {
				descendant.Transparency = 1;
				descendant.CanCollide = false;
			}
		}
	}

	private showSpeedPowerup(powerup: SpeedPowerup): void {
		const originalStates = this.powerupOriginalState.get(powerup);
		if (!originalStates) return;

		for (const [part, state] of originalStates) {
			part.Transparency = state.transparency;
			part.CanCollide = state.canCollide;
		}
	}

	private spawnPowerupPickupParticles(position: Vector3): void {
		if (!this.powerupPickupParticleTemplate) return;

		// Create a temporary attachment at the pickup location
		const attachment = new Instance("Attachment");
		attachment.WorldPosition = position;
		attachment.Parent = Workspace.Terrain;

		// Clone and setup emitter
		const emitter = this.powerupPickupParticleTemplate.Clone();
		emitter.Parent = attachment;

		// Emit particles
		emitter.Emit(BallConfig.POWERUP_PICKUP_PARTICLE_COUNT);

		// Clean up after particles fade
		task.delay(BallConfig.POWERUP_PICKUP_PARTICLE_LIFETIME + 0.5, () => {
			attachment.Destroy();
		});
	}

	private updatePowerupRespawns(): void {
		const now = tick();

		for (const [powerup, hideTime] of this.powerupRespawnTimers) {
			if (now - hideTime >= BallConfig.POWERUP_RESPAWN_TIME) {
				this.showSpeedPowerup(powerup);
				this.powerupRespawnTimers.delete(powerup);
			}
		}
	}

	private updatePowerupAnimations(dt: number): void {
		this.powerupAnimTime += dt;

		for (const powerup of this.speedPowerups) {
			// Skip if powerup is hidden (respawning)
			if (this.powerupRespawnTimers.has(powerup)) continue;

			const originalCFrame = this.powerupOriginalCFrames.get(powerup);
			if (!originalCFrame) continue;

			// Calculate bob offset (sine wave)
			const bobOffset = math.sin(this.powerupAnimTime * BallConfig.POWERUP_BOB_SPEED * math.pi * 2)
				* BallConfig.POWERUP_BOB_HEIGHT;

			// Calculate spin rotation (continuous)
			const spinAngle = this.powerupAnimTime * BallConfig.POWERUP_SPIN_SPEED * math.pi * 2;

			// Apply animation: translate up/down, rotate around Y axis
			const animatedCFrame = originalCFrame
				.mul(new CFrame(0, bobOffset, 0))
				.mul(CFrame.Angles(0, spinAngle, 0));

			powerup.PivotTo(animatedCFrame);
		}
	}

	private usePowerup(): void {
		if (this.currentPowerup === undefined || !this.sphere) return;

		if (this.currentPowerup === "speed") {
			// Get movement direction (camera-relative)
			const moveDir = this.getMoveDirection();

			// Use movement direction if moving, otherwise use camera forward
			let direction: Vector3;
			if (moveDir.Magnitude > 0.1) {
				direction = moveDir.Unit;
			} else {
				// Fallback to camera forward (flattened to horizontal)
				const camLook = this.camera.CFrame.LookVector;
				direction = new Vector3(camLook.X, 0, camLook.Z).Unit;
			}

			// Apply horizontal impulse
			const impulse = new Vector3(direction.X, 0, direction.Z).Unit.mul(BallConfig.POWERUP_SPEED_BOOST_FORCE);
			this.sphere.ApplyImpulse(impulse);

			// Trigger neon glow flash
			this.triggerNeonGlowFlash();
		}

		// Clear powerup
		this.currentPowerup = undefined;
		this.powerupUIController.setPowerup(undefined);
	}
}

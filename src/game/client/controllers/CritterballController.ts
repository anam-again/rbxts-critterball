import { Controller, OnStart, Dependency } from "@flamework/core";
import { CollectionService, ContextActionService, Players, RunService, Workspace } from "@rbxts/services";
import { BallConfig, PowerupColors } from "shared/constants/BallConfig";
import { lerpRgb } from "shared/utilities/ColorUtils";
import { ClientEvents, RaceClientEvents, RaceServerEvents } from "game/client/network";
import { TAGS, SPEED_BOOST_ATTRIBUTES, BOUNCER_ATTRIBUTES } from "shared/globals";
import { PowerupUIController, PowerupType } from "./PowerupUIController";
import { RaceGameState } from "shared/types/RaceTypes";
import { GamemodeId } from "shared/types/GameTypes";
import { GameModeController } from "./GameModeController";
import { BallState } from "game/client/state/BallState";
import { PART_NAMES } from "shared/constants/PartNames";
import { PARTICLE_NAMES } from "shared/constants/UINames";
import { INPUT_ACTIONS } from "shared/constants/InputActions";

/**
 * Main ball controller - coordinates ball setup, input handling, and delegates
 * to other systems for effects, interactions, and physics.
 *
 * Responsibilities:
 * - Ball initialization and setup
 * - Input binding and movement
 * - Game state management (frozen/racing)
 * - Coordinate with BallState singleton for shared state
 *
 * Delegates to:
 * - BallEffectsController: Visual effects (trail, particles, camera effects)
 * - InteractionsController: Boost zones, bouncers, powerups (future)
 */
@Controller()
export class CritterballController implements OnStart {
	private gameModeController = Dependency<GameModeController>();

	// Input state
	private moveForward = false;
	private moveBackward = false;
	private moveLeft = false;
	private moveRight = false;
	private jumpRequested = false;

	// Jump tracking
	private hasJumped = false;

	// Speed boost zones
	private boostZoneObjects: BoostZoneObject[] = [];
	private boostZoneParts: BasePart[] = [];
	private boostZoneOverlapParams = new OverlapParams();
	private activeBoostZones = new Set<BasePart>();
	private boostZoneAnimTime = 0;
	private boostZoneFlashState = new Map<BoostZoneObject, { flashTime: number; isFlashing: boolean; isInside: boolean }>();
	private lastBoostCheckTime = 0;
	private readonly BOOST_CHECK_INTERVAL = 0.05; // 50ms throttle for overlap checks

	// Bouncer system
	private bouncers: Bouncer[] = [];
	private bouncerCooldowns = new Map<Bouncer, number>();
	private bouncerAnimations = new Map<Bouncer, { startTime: number; phase: "expand" | "shrink"; originalSize: Vector3 }>();
	private bouncerConnections: RBXScriptConnection[] = [];

	// Powerup system
	private powerupUIController = Dependency<PowerupUIController>();
	private currentPowerup: PowerupType = undefined;
	private speedPowerups: SpeedPowerup[] = [];
	private powerupRespawnTimers = new Map<SpeedPowerup, number>();
	private powerupOriginalState = new Map<SpeedPowerup, Map<BasePart, { transparency: number; canCollide: boolean }>>();
	private powerupConnections: RBXScriptConnection[] = [];
	private powerupOriginalCFrames = new Map<SpeedPowerup, CFrame>();
	private powerupAnimTime = 0;
	private powerupPickupParticleTemplate?: ParticleEmitter;

	onStart(): void {

		// Setup boost zone overlap params
		this.boostZoneOverlapParams.FilterType = Enum.RaycastFilterType.Include;

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

		// Wait for gamemode to be ready before setting up mode-specific behavior
		this.gameModeController.onGamemodeReady((gamemodeId) => {
			if (gamemodeId === GamemodeId.SANDBOX) {
				// Sandbox mode: start unfrozen immediately
				BallState.setIsFrozen(false);
				BallState.setGameState(RaceGameState.RACING);
			} else {
				// Race mode: Listen for game state changes
				RaceClientEvents.gameStateChanged.connect((state) => {
					this.onGameStateChanged(state);
				});

				// Listen for race started
				RaceClientEvents.raceStarted.connect(() => {
					BallState.setIsFrozen(false);
					BallState.setGameState(RaceGameState.RACING);
				});
			}
		});

		// Setup input bindings
		this.setupInput();

		// Start physics loop
		RunService.RenderStepped.Connect((dt) => this.onRenderStepped(dt));
	}

	private onBallReady(ball: Model): void {
		const sphere = ball.FindFirstChild(PART_NAMES.SPHERE) as BasePart;

		if (!sphere) {
			warn(`Ball missing ${PART_NAMES.SPHERE} part!`);
			return;
		}

		// Initialize shared ball state
		BallState.initializeBall(ball, sphere);

		// Set camera subject to the sphere for smooth following
		const camera = BallState.getCamera();
		if (camera) {
			camera.CameraSubject = sphere;
		}

		// Create powerup pickup particle template
		this.createPowerupPickupParticleTemplate();

		// Notify server that we're loaded and ready
		RaceServerEvents.playerLoaded.fire();
	}

	private onGameStateChanged(state: RaceGameState): void {
		BallState.setGameState(state);

		if (state === RaceGameState.RACING) {
			BallState.setIsFrozen(false);
		} else {
			BallState.setIsFrozen(true);
		}
	}

	private setupBoostZones(): void {
		const existingZones = CollectionService.GetTagged(TAGS.SPEED_BOOST_ZONE);
		for (const zone of existingZones) {
			this.addBoostZoneObject(zone);
		}

		CollectionService.GetInstanceAddedSignal(TAGS.SPEED_BOOST_ZONE).Connect((zone) => {
			this.addBoostZoneObject(zone);
		});

		CollectionService.GetInstanceRemovedSignal(TAGS.SPEED_BOOST_ZONE).Connect((zone) => {
			this.removeBoostZoneObject(zone);
		});

		this.boostZoneOverlapParams.FilterDescendantsInstances = this.boostZoneParts;
	}

	private addBoostZoneObject(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const boostZonePart = instance.FindFirstChild(PART_NAMES.BOOST_ZONE) as BasePart | undefined;
		if (!boostZonePart || !boostZonePart.IsA("BasePart")) return;

		const zoneObject = instance as BoostZoneObject;
		this.boostZoneObjects.push(zoneObject);
		this.boostZoneParts.push(boostZonePart);
		this.boostZoneFlashState.set(zoneObject, { flashTime: 0, isFlashing: false, isInside: false });

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

		const boostZonePart = instance.FindFirstChild(PART_NAMES.BOOST_ZONE) as BasePart | undefined;
		if (boostZonePart) {
			const partIndex = this.boostZoneParts.indexOf(boostZonePart);
			if (partIndex !== -1) {
				this.boostZoneParts.remove(partIndex);
			}
		}

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
		const existingBouncers = CollectionService.GetTagged(TAGS.BOUNCER);
		for (const bouncer of existingBouncers) {
			this.addBouncer(bouncer);
		}

		CollectionService.GetInstanceAddedSignal(TAGS.BOUNCER).Connect((bouncer) => {
			this.addBouncer(bouncer);
		});

		CollectionService.GetInstanceRemovedSignal(TAGS.BOUNCER).Connect((bouncer) => {
			this.removeBouncer(bouncer);
		});
	}

	private addBouncer(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const bouncer = instance as Bouncer;
		const impactArea = bouncer.FindFirstChild(PART_NAMES.IMPACT_AREA) as BasePart | undefined;
		const mainBouncer = bouncer.FindFirstChild(PART_NAMES.MAIN_BOUNCER) as BasePart | undefined;

		if (!impactArea || !mainBouncer) {
			warn(`Bouncer ${instance.Name} missing ImpactArea or MainBouncer`);
			return;
		}

		this.bouncers.push(bouncer);
		this.bouncerCooldowns.set(bouncer, 0);

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
		const now = tick();
		const lastTrigger = this.bouncerCooldowns.get(bouncer) ?? 0;
		if (now - lastTrigger < BallConfig.BOUNCER_COOLDOWN) return;

		// Check if hit is the local player's ball
		const sphere = BallState.getSphere();
		const isLocalPlayerBall = sphere !== undefined && hit === sphere;

		// Check if hit is a bot ball (parent model name starts with "Bot_")
		const isBotBall = hit.Parent?.IsA("Model") && hit.Parent.Name.sub(1, 4) === "Bot_" && hit.Name === PART_NAMES.SPHERE;

		// Only trigger for player or bot balls
		if (!isLocalPlayerBall && !isBotBall) return;

		this.bouncerCooldowns.set(bouncer, now);

		// Only apply impulse for local player (server handles bot impulses)
		if (isLocalPlayerBall && sphere) {
			const bouncerCenter = bouncer.MainBouncer.Position;
			const ballPosition = sphere.Position;
			const directionAway = new Vector3(
				ballPosition.X - bouncerCenter.X,
				0,
				ballPosition.Z - bouncerCenter.Z,
			);

			let impulseDirection: Vector3;
			if (directionAway.Magnitude > 0.1) {
				impulseDirection = directionAway.Unit;
			} else {
				const velocity = sphere.AssemblyLinearVelocity;
				const horizontalVel = new Vector3(velocity.X, 0, velocity.Z);
				impulseDirection = horizontalVel.Magnitude > 0.1 ? horizontalVel.Unit : new Vector3(1, 0, 0);
			}

			const impulseForce = (bouncer.GetAttribute(BOUNCER_ATTRIBUTES.IMPULSE_FORCE) as number | undefined) ??
				BallConfig.BOUNCER_IMPULSE_FORCE;

			const impulse = impulseDirection.mul(impulseForce);
			sphere.ApplyImpulse(impulse);
		}

		// Always trigger animation for both player and bot
		this.startBouncerAnimation(bouncer);
	}

	private startBouncerAnimation(bouncer: Bouncer): void {
		const mainBouncer = bouncer.MainBouncer;

		const existingAnim = this.bouncerAnimations.get(bouncer);
		const originalSize = existingAnim?.originalSize ?? mainBouncer.Size;

		this.bouncerAnimations.set(bouncer, {
			startTime: tick(),
			phase: "expand",
			originalSize: originalSize,
		});
	}

	private updateBouncerAnimations(_dt: number): void {
		const now = tick();

		for (const bouncer of this.bouncers) {
			const anim = this.bouncerAnimations.get(bouncer);
			if (!anim) continue;

			const mainBouncer = bouncer.MainBouncer;
			const elapsed = now - anim.startTime;

			if (anim.phase === "expand") {
				const progress = math.clamp(elapsed / BallConfig.BOUNCER_EXPAND_DURATION, 0, 1);
				const scale = this.lerp(1, BallConfig.BOUNCER_EXPAND_SCALE, progress);
				mainBouncer.Size = anim.originalSize.mul(scale);

				if (progress >= 1) {
					anim.phase = "shrink";
					anim.startTime = now;
				}
			} else {
				const progress = math.clamp(elapsed / BallConfig.BOUNCER_SHRINK_DURATION, 0, 1);
				const scale = this.lerp(BallConfig.BOUNCER_EXPAND_SCALE, 1, progress);
				mainBouncer.Size = anim.originalSize.mul(scale);

				if (progress >= 1) {
					mainBouncer.Size = anim.originalSize;
					this.bouncerAnimations.delete(bouncer);
				}
			}
		}
	}

	private applyBoostZones(): void {
		const sphere = BallState.getSphere();
		if (!sphere || this.boostZoneParts.size() === 0) {
			return;
		}

		// Throttle expensive GetPartsInPart call
		const now = tick();
		if (now - this.lastBoostCheckTime < this.BOOST_CHECK_INTERVAL) {
			return;
		}
		this.lastBoostCheckTime = now;

		const overlappingParts = Workspace.GetPartsInPart(sphere, this.boostZoneOverlapParams);

		const currentZones = new Set<BasePart>();

		for (const zonePart of overlappingParts) {
			currentZones.add(zonePart);

			if (!this.activeBoostZones.has(zonePart)) {
				const boostForce = (zonePart.GetAttribute(SPEED_BOOST_ATTRIBUTES.BOOST_FORCE) as number | undefined) ??
					BallConfig.SPEED_BOOST_DEFAULT_FORCE;

				const boostDirectionType = (zonePart.GetAttribute(SPEED_BOOST_ATTRIBUTES.BOOST_DIRECTION) as string | undefined) ??
					BallConfig.SPEED_BOOST_DEFAULT_DIRECTION;

				let boostDirection: Vector3;

				if (boostDirectionType === "Velocity") {
					const velocity = sphere.AssemblyLinearVelocity;
					const horizontalVelocity = new Vector3(velocity.X, 0, velocity.Z);
					if (horizontalVelocity.Magnitude > 0.1) {
						boostDirection = horizontalVelocity.Unit;
					} else {
						boostDirection = zonePart.CFrame.LookVector;
					}
				} else {
					boostDirection = zonePart.CFrame.LookVector;
				}

				const impulse = boostDirection.mul(boostForce);
				sphere.ApplyImpulse(impulse);

				const zoneObject = this.getBoostZoneObjectFromPart(zonePart);
				if (zoneObject) {
					this.triggerBoostFlash(zoneObject, true);
				}
			}
		}

		for (const zonePart of this.activeBoostZones) {
			if (!currentZones.has(zonePart)) {
				const zoneObject = this.getBoostZoneObjectFromPart(zonePart);
				if (zoneObject) {
					this.startBoostFadeOut(zoneObject);
				}
			}
		}

		this.activeBoostZones = currentZones;
	}

	private triggerBoostFlash(zoneObject: BoostZoneObject, isInside: boolean): void {
		const state = this.boostZoneFlashState.get(zoneObject);
		if (state) {
			state.isFlashing = true;
			state.isInside = isInside;
			state.flashTime = 0;
		}
	}

	private startBoostFadeOut(zoneObject: BoostZoneObject): void {
		const state = this.boostZoneFlashState.get(zoneObject);
		if (state && state.isInside) {
			state.isInside = false;
			state.flashTime = 0;
		}
	}

	private updateBoostZoneVisuals(dt: number): void {
		this.boostZoneAnimTime += dt;

		for (const zoneObject of this.boostZoneObjects) {
			const flashState = this.boostZoneFlashState.get(zoneObject);
			if (!flashState) continue;

			let flashIntensity = 0;

			if (flashState.isFlashing) {
				if (flashState.isInside) {
					flashIntensity = 1;
				} else {
					flashState.flashTime += dt;

					const holdDuration = BallConfig.BOOST_FLASH_HOLD_DURATION;
					const fadeDuration = BallConfig.BOOST_FLASH_FADE_DURATION;
					const totalDuration = holdDuration + fadeDuration;

					if (flashState.flashTime < holdDuration) {
						flashIntensity = 1;
					} else if (flashState.flashTime < totalDuration) {
						const fadeProgress = (flashState.flashTime - holdDuration) / fadeDuration;
						flashIntensity = 1 - fadeProgress;
					} else {
						flashState.isFlashing = false;
						flashState.flashTime = 0;
						flashIntensity = 0;
					}
				}
			}

			const cycleProgress = (this.boostZoneAnimTime * BallConfig.BOOST_ARROW_CYCLE_SPEED) % 1;
			const invisibleArrowIndex = 2 - math.floor(cycleProgress * 3);
			const arrowFadeProgress = (cycleProgress * 3) % 1;

			const getArrowTransparency = (arrowIndex: number): number => {
				if (flashIntensity > 0) {
					const normalTrans = arrowIndex === invisibleArrowIndex ? arrowFadeProgress : 0;
					return normalTrans * (1 - flashIntensity);
				}
				if (arrowIndex === invisibleArrowIndex) {
					return arrowFadeProgress;
				}
				const prevInvisibleIndex = (invisibleArrowIndex + 1) % 3;
				if (arrowIndex === prevInvisibleIndex) {
					return 1 - arrowFadeProgress;
				}
				return 0;
			};

			this.setModelTransparency(zoneObject.BoostArrow1, getArrowTransparency(0));
			this.setModelTransparency(zoneObject.BoostArrow2, getArrowTransparency(1));
			this.setModelTransparency(zoneObject.BoostArrow3, getArrowTransparency(2));

			const outlineSine = math.sin(this.boostZoneAnimTime * BallConfig.BOOST_OUTLINE_PULSE_SPEED * math.pi * 2);
			const outlineIdleTransparency = this.lerp(
				BallConfig.BOOST_OUTLINE_LOW_TRANSPARENCY,
				BallConfig.BOOST_OUTLINE_HIGH_TRANSPARENCY,
				(outlineSine + 1) / 2,
			);
			const outlineTransparency = outlineIdleTransparency * (1 - flashIntensity);
			this.setModelTransparency(zoneObject.Outline, outlineTransparency);

			const bodySine = math.sin(this.boostZoneAnimTime * BallConfig.BOOST_BODY_PULSE_SPEED * math.pi * 2);
			const bodyIdleTransparency = this.lerp(
				BallConfig.BOOST_BODY_LOW_TRANSPARENCY,
				BallConfig.BOOST_BODY_HIGH_TRANSPARENCY,
				(bodySine + 1) / 2,
			);
			const bodyTransparency = bodyIdleTransparency * (1 - flashIntensity);
			zoneObject.Body.Transparency = bodyTransparency;

			const bodyColor = lerpRgb(
				BallConfig.BOOST_BODY_COLOR_IDLE,
				BallConfig.BOOST_BODY_COLOR_FLASH,
				flashIntensity,
			);
			zoneObject.Body.Color = bodyColor;

			const outlineColor = lerpRgb(
				BallConfig.BOOST_OUTLINE_COLOR_IDLE,
				BallConfig.BOOST_OUTLINE_COLOR_FLASH,
				flashIntensity,
			);
			this.setModelColor(zoneObject.Outline, outlineColor);

			const arrowColor = lerpRgb(
				BallConfig.BOOST_ARROW_COLOR_IDLE,
				BallConfig.BOOST_ARROW_COLOR_FLASH,
				flashIntensity,
			);
			this.setModelColor(zoneObject.BoostArrow1, arrowColor);
			this.setModelColor(zoneObject.BoostArrow2, arrowColor);
			this.setModelColor(zoneObject.BoostArrow3, arrowColor);
		}
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

	private createPowerupPickupParticleTemplate(): void {
		const emitter = new Instance("ParticleEmitter");
		emitter.Name = PARTICLE_NAMES.POWERUP_PICKUP_PARTICLES;
		emitter.Enabled = false;
		emitter.Lifetime = new NumberRange(
			BallConfig.POWERUP_PICKUP_PARTICLE_LIFETIME * 0.7,
			BallConfig.POWERUP_PICKUP_PARTICLE_LIFETIME,
		);
		emitter.Speed = new NumberRange(
			BallConfig.POWERUP_PICKUP_PARTICLE_SPEED_MIN,
			BallConfig.POWERUP_PICKUP_PARTICLE_SPEED_MAX,
		);
		emitter.SpreadAngle = new Vector2(180, 180);
		emitter.Drag = 3;
		emitter.Rate = 0;
		emitter.RotSpeed = new NumberRange(-360, 360);
		emitter.Rotation = new NumberRange(0, 360);

		emitter.Texture = "rbxassetid://6490035152";

		emitter.Size = new NumberSequence([
			new NumberSequenceKeypoint(0, 0.2),
			new NumberSequenceKeypoint(0.15, BallConfig.POWERUP_PICKUP_PARTICLE_SIZE),
			new NumberSequenceKeypoint(1, 0),
		]);

		emitter.Transparency = new NumberSequence([
			new NumberSequenceKeypoint(0, 0),
			new NumberSequenceKeypoint(0.4, 0.2),
			new NumberSequenceKeypoint(1, 1),
		]);

		emitter.LightEmission = 1;
		emitter.LightInfluence = 0;

		emitter.Color = new ColorSequence(PowerupColors.PICKUP_PARTICLE);

		this.powerupPickupParticleTemplate = emitter;
	}

	private setupInput(): void {
		ContextActionService.BindAction(
			INPUT_ACTIONS.MOVE_FORWARD,
			(_, state) => {
				this.moveForward = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.W,
		);

		ContextActionService.BindAction(
			INPUT_ACTIONS.MOVE_BACKWARD,
			(_, state) => {
				this.moveBackward = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.S,
		);

		ContextActionService.BindAction(
			INPUT_ACTIONS.MOVE_LEFT,
			(_, state) => {
				this.moveLeft = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.A,
		);

		ContextActionService.BindAction(
			INPUT_ACTIONS.MOVE_RIGHT,
			(_, state) => {
				this.moveRight = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.D,
		);

		ContextActionService.BindAction(
			INPUT_ACTIONS.JUMP,
			(_, state) => {
				this.jumpRequested = state === Enum.UserInputState.Begin;
				return Enum.ContextActionResult.Pass;
			},
			false,
			Enum.KeyCode.Space,
		);

		ContextActionService.BindAction(
			INPUT_ACTIONS.USE_POWERUP,
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

		const sphere = BallState.getSphere();
		if (!sphere) return;

		// Skip movement physics when frozen (waiting or countdown state)
		if (BallState.getIsFrozen()) {
			// Update previous velocity even when frozen
			BallState.updatePreviousVelocity();
			return;
		}

		// Get current horizontal velocity and speed
		const velocity = sphere.AssemblyLinearVelocity;
		const horizontalVelocity = new Vector3(velocity.X, 0, velocity.Z);
		const currentSpeed = horizontalVelocity.Magnitude;

		// Calculate camera-relative movement direction
		const moveDir = this.getMoveDirection();

		if (moveDir.Magnitude > 0) {
			// Calculate acceleration multiplier
			let accelMultiplier = 1;

			if (currentSpeed < BallConfig.LOW_SPEED_THRESHOLD) {
				const speedRatio = currentSpeed / BallConfig.LOW_SPEED_THRESHOLD;
				accelMultiplier = BallConfig.LOW_SPEED_MULTIPLIER - (BallConfig.LOW_SPEED_MULTIPLIER - 1) * speedRatio;
			} else if (currentSpeed > BallConfig.DIMINISHING_RETURNS_START) {
				const excessSpeed = currentSpeed - BallConfig.DIMINISHING_RETURNS_START;
				const maxExcessSpeed = BallConfig.MAX_SPEED - BallConfig.DIMINISHING_RETURNS_START;
				const diminishRatio = 1 - math.exp((-3 * excessSpeed) / maxExcessSpeed);
				accelMultiplier = 1 - (1 - BallConfig.DIMINISHING_RETURNS_MIN) * diminishRatio;
			}

			// Only apply forward impulse if under max speed
			if (currentSpeed < BallConfig.MAX_SPEED) {
				const impulse = moveDir.mul(BallConfig.MOVE_IMPULSE_FORCE * accelMultiplier * dt);
				sphere.ApplyImpulse(impulse);
			}

			// Apply turning force to redirect velocity
			if (currentSpeed > 1) {
				const currentDir = horizontalVelocity.Unit;
				const turnAmount = 1 - moveDir.Dot(currentDir);

				if (turnAmount > 0.1) {
					const desiredVelocity = moveDir.mul(currentSpeed * BallConfig.TURN_SPEED_FACTOR);
					const velocityDiff = desiredVelocity.sub(horizontalVelocity);
					const turnImpulse = velocityDiff.mul(BallConfig.TURN_FORCE * dt * turnAmount);
					sphere.ApplyImpulse(turnImpulse);
				}
			}

			// Apply angular impulse to make ball roll
			const rollAxis = moveDir.Cross(Vector3.yAxis);
			const angularImpulse = rollAxis.mul(BallConfig.ROLL_TORQUE_FORCE * dt);
			sphere.ApplyAngularImpulse(angularImpulse);
		}

		// Apply boost zones (external forces that can exceed max speed)
		this.applyBoostZones();

		// Apply velocity damping (natural slowdown)
		if (currentSpeed > 0.1) {
			const dampingFactor = 1 - BallConfig.VELOCITY_DAMPING * dt;
			const dampedHorizontal = horizontalVelocity.mul(dampingFactor);
			sphere.AssemblyLinearVelocity = new Vector3(dampedHorizontal.X, velocity.Y, dampedHorizontal.Z);
		}

		// Handle jumping
		const grounded = BallState.isGrounded();

		// Reset jump when touching ground
		if (grounded) {
			this.hasJumped = false;
		}

		if (this.jumpRequested) {
			if (grounded && !this.hasJumped) {
				const jumpImpulse = new Vector3(0, BallConfig.JUMP_IMPULSE_FORCE, 0);
				sphere.ApplyImpulse(jumpImpulse);
				this.hasJumped = true;
			}

			this.jumpRequested = false;
		}

		// Store velocity for next frame (used by BallEffectsController)
		BallState.updatePreviousVelocity();
	}

	private getMoveDirection(): Vector3 {
		const camera = BallState.getCamera();
		if (!camera) return Vector3.zero;

		const camLook = camera.CFrame.LookVector;
		const forward = new Vector3(camLook.X, 0, camLook.Z).Unit;
		const right = new Vector3(camera.CFrame.RightVector.X, 0, camera.CFrame.RightVector.Z).Unit;

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

		if (direction.Magnitude > 0) {
			direction = direction.Unit;
		}

		return direction;
	}

	private lerp(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}

	// ============================================
	// Speed Powerup System
	// ============================================

	private setupSpeedPowerups(): void {
		const existingPowerups = CollectionService.GetTagged(TAGS.SPEED_POWERUP);
		for (const powerup of existingPowerups) {
			this.addSpeedPowerup(powerup);
		}

		CollectionService.GetInstanceAddedSignal(TAGS.SPEED_POWERUP).Connect((powerup) => {
			this.addSpeedPowerup(powerup);
		});

		CollectionService.GetInstanceRemovedSignal(TAGS.SPEED_POWERUP).Connect((powerup) => {
			this.removeSpeedPowerup(powerup);
		});
	}

	private addSpeedPowerup(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const powerup = instance as SpeedPowerup;
		const collisionBox = powerup.FindFirstChild(PART_NAMES.COLLISION_BOX) as BasePart | undefined;

		if (!collisionBox) {
			warn(`SpeedPowerup ${instance.Name} missing CollisionBox`);
			return;
		}

		this.speedPowerups.push(powerup);

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

		this.powerupOriginalCFrames.set(powerup, powerup.GetPivot());

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
		const sphere = BallState.getSphere();
		if (!sphere || hit !== sphere) return;

		if (this.currentPowerup !== undefined) return;

		if (this.powerupRespawnTimers.has(powerup)) return;

		this.currentPowerup = "speed";
		this.powerupUIController.setPowerup("speed");

		this.spawnPowerupPickupParticles(powerup.GetPivot().Position);

		this.hideSpeedPowerup(powerup);

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

		const attachment = new Instance("Attachment");
		attachment.WorldPosition = position;
		attachment.Parent = Workspace.Terrain;

		const emitter = this.powerupPickupParticleTemplate.Clone();
		emitter.Parent = attachment;

		emitter.Emit(BallConfig.POWERUP_PICKUP_PARTICLE_COUNT);

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
			if (this.powerupRespawnTimers.has(powerup)) continue;

			const originalCFrame = this.powerupOriginalCFrames.get(powerup);
			if (!originalCFrame) continue;

			const bobOffset = math.sin(this.powerupAnimTime * BallConfig.POWERUP_BOB_SPEED * math.pi * 2)
				* BallConfig.POWERUP_BOB_HEIGHT;

			const spinAngle = this.powerupAnimTime * BallConfig.POWERUP_SPIN_SPEED * math.pi * 2;

			const animatedCFrame = originalCFrame
				.mul(new CFrame(0, bobOffset, 0))
				.mul(CFrame.Angles(0, spinAngle, 0));

			powerup.PivotTo(animatedCFrame);
		}
	}

	private usePowerup(): void {
		const sphere = BallState.getSphere();
		if (this.currentPowerup === undefined || !sphere) return;

		if (this.currentPowerup === "speed") {
			const moveDir = this.getMoveDirection();

			let direction: Vector3;
			if (moveDir.Magnitude > 0.1) {
				direction = moveDir.Unit;
			} else {
				const camera = BallState.getCamera();
				const camLook = camera.CFrame.LookVector;
				direction = new Vector3(camLook.X, 0, camLook.Z).Unit;
			}

			const impulse = new Vector3(direction.X, 0, direction.Z).Unit.mul(BallConfig.POWERUP_SPEED_BOOST_FORCE);
			sphere.ApplyImpulse(impulse);
		}

		this.currentPowerup = undefined;
		this.powerupUIController.setPowerup(undefined);
	}
}

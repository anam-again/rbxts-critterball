import { Controller, OnStart, Dependency } from "@flamework/core";
import { CollectionService, Players, RunService, Workspace } from "@rbxts/services";
import { ClientEvents, RaceClientEvents } from "game/client/network";
import { BallConfig } from "shared/constants/BallConfig";
import { RaceConfig } from "shared/constants/RaceConfig";
import { TAGS } from "shared/globals";
import { RaceGameState } from "shared/types/RaceTypes";
import { GameModeController } from "./GameModeController";

const LOG_PREFIX = "[BallCameraController]";

@Controller()
export class BallCameraController implements OnStart {
	private gameModeController = Dependency<GameModeController>();
	private camera = Workspace.CurrentCamera;
	private player = Players.LocalPlayer;

	// Camera mode
	private cameraMode: "showcase" | "transitioning" | "player" = "showcase";
	private ballSphere?: BasePart;

	// Showcase camera waypoints
	private showcaseWaypoints: BasePart[] = [];
	private currentWaypointIndex = 0;
	private waypointProgress = 0;
	private currentShowcaseCFrame: CFrame = new CFrame();

	// Transition state
	private transitionStartCFrame: CFrame = new CFrame();
	private transitionProgress = 0;
	private transitionStartTime = 0;

	// Camera offset for player camera (distance behind and above the ball)
	private readonly CAMERA_DISTANCE = 15;
	private readonly CAMERA_HEIGHT = 6;

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		// Wait for gamemode to be ready before initializing camera behavior
		this.gameModeController.onGamemodeReady((gamemodeId) => {
			if (gamemodeId === "sandbox") {
				print(`${LOG_PREFIX} Sandbox mode - skipping showcase camera`);
				this.cameraMode = "player";

				// Just listen for ball ready to set camera subject
				ClientEvents.ballReady.connect((ball) => {
					this.onBallReady(ball);
					this.finalizePlayerCamera();
				});
				return;
			}

			// Race mode: Setup showcase camera waypoints
			this.setupShowcaseWaypoints();

			// Listen for ball ready event to set camera subject
			ClientEvents.ballReady.connect((ball) => {
				this.onBallReady(ball);
			});

			// Listen for countdown started to begin camera transition
			RaceClientEvents.countdownStarted.connect(() => {
				this.onCountdownStarted();
			});

			// Listen for game state changes
			RaceClientEvents.gameStateChanged.connect((state) => {
				this.onGameStateChanged(state);
			});

			// Start render loop for camera updates
			RunService.RenderStepped.Connect((dt) => this.onRenderStepped(dt));
		});
	}

	private setupShowcaseWaypoints(): void {
		// Find folder tagged with ShowcaseCameraWaypoints
		const waypointFolders = CollectionService.GetTagged(TAGS.SHOWCASE_CAMERA_WAYPOINTS);

		if (waypointFolders.size() === 0) {
			print(`${LOG_PREFIX} No ShowcaseCameraWaypoints folder found - showcase camera disabled`);
			return;
		}

		const waypointsFolder = waypointFolders[0] as Folder;
		print(`${LOG_PREFIX} Found waypoints folder: ${waypointsFolder.GetFullName()}`);

		// Parse waypoint parts
		const waypoints: Array<{ number: number; part: BasePart }> = [];

		for (const child of waypointsFolder.GetChildren()) {
			if (!child.IsA("BasePart")) continue;

			// Parse number from name (e.g., "Waypoint1" -> 1)
			const match = child.Name.match("(%d+)$");
			if (match && match[0]) {
				const num = tonumber(match[0]);
				if (num !== undefined) {
					waypoints.push({ number: num, part: child });
				}
			}
		}

		// Sort by number
		waypoints.sort((a, b) => a.number < b.number);
		this.showcaseWaypoints = waypoints.map((w) => w.part);

		print(`${LOG_PREFIX} Loaded ${this.showcaseWaypoints.size()} waypoints`);

		// Initialize camera at first waypoint
		if (this.showcaseWaypoints.size() > 0) {
			this.currentShowcaseCFrame = this.showcaseWaypoints[0].CFrame;
			this.cameraMode = "showcase";

			// Set camera to scriptable mode for showcase
			if (this.camera) {
				this.camera.CameraType = Enum.CameraType.Scriptable;
				this.camera.CFrame = this.currentShowcaseCFrame;
			}
		}
	}

	private onBallReady(ball: Model): void {
		const sphere = ball.FindFirstChild("Sphere") as BasePart;
		if (!sphere) return;

		this.ballSphere = sphere;

		// If we're already in player mode (race already started), switch camera now
		if (this.cameraMode === "player") {
			this.finalizePlayerCamera();
		}

		print(`${LOG_PREFIX} Ball ready`);
	}

	private onCountdownStarted(): void {
		print(`${LOG_PREFIX} Countdown started - beginning camera transition`);
		this.startCameraTransition();
	}

	private onGameStateChanged(state: RaceGameState): void {
		print(`${LOG_PREFIX} Game state changed: ${state}`);

		if (state === "countdown") {
			if (this.cameraMode === "showcase") {
				this.startCameraTransition();
			}
		} else if (state === "racing") {
			// Ensure we're in player mode when racing starts
			if (this.cameraMode !== "player") {
				this.finalizePlayerCamera();
			}
		}
	}

	private startCameraTransition(): void {
		if (this.cameraMode === "player" || this.cameraMode === "transitioning") return;
		if (!this.camera) return;

		this.cameraMode = "transitioning";
		this.transitionStartCFrame = this.camera.CFrame;
		this.transitionProgress = 0;
		this.transitionStartTime = tick();

		print(`${LOG_PREFIX} Starting camera transition to player`);
	}

	private getTargetPlayerCFrame(): CFrame {
		if (!this.ballSphere) {
			return this.transitionStartCFrame;
		}

		const ballPosition = this.ballSphere.Position;

		// Get direction from ball to current camera (or use a default direction)
		let lookDirection: Vector3;
		if (this.camera) {
			const toCamera = this.camera.CFrame.Position.sub(ballPosition);
			const horizontalDir = new Vector3(toCamera.X, 0, toCamera.Z);
			if (horizontalDir.Magnitude > 0.1) {
				lookDirection = horizontalDir.Unit;
			} else {
				lookDirection = new Vector3(0, 0, 1);
			}
		} else {
			lookDirection = new Vector3(0, 0, 1);
		}

		// Calculate camera position behind and above the ball
		const cameraPosition = ballPosition
			.add(lookDirection.mul(this.CAMERA_DISTANCE))
			.add(new Vector3(0, this.CAMERA_HEIGHT, 0));

		// Look at the ball
		return CFrame.lookAt(cameraPosition, ballPosition);
	}

	private finalizePlayerCamera(): void {
		this.cameraMode = "player";

		if (!this.camera) return;

		// Set camera subject to the ball sphere
		if (this.ballSphere) {
			this.camera.CameraSubject = this.ballSphere;
			this.camera.CameraType = Enum.CameraType.Custom;

			// Set zoom limits on the player
			this.player.CameraMinZoomDistance = BallConfig.CAMERA_MIN_ZOOM;
			this.player.CameraMaxZoomDistance = BallConfig.CAMERA_MAX_ZOOM;

			print(`${LOG_PREFIX} Camera following ball`);
		} else {
			print(`${LOG_PREFIX} Ball not ready yet - will switch when ready`);
		}
	}

	private onRenderStepped(dt: number): void {
		if (!this.camera) return;

		if (this.cameraMode === "showcase") {
			this.updateShowcaseCamera(dt);
		} else if (this.cameraMode === "transitioning") {
			this.updateTransitionCamera(dt);
		}
	}

	private updateShowcaseCamera(dt: number): void {
		if (this.showcaseWaypoints.size() < 2) return;

		// Get current and next waypoint
		const currentWaypoint = this.showcaseWaypoints[this.currentWaypointIndex];
		const nextWaypointIndex = (this.currentWaypointIndex + 1) % this.showcaseWaypoints.size();
		const nextWaypoint = this.showcaseWaypoints[nextWaypointIndex];

		// Advance progress
		this.waypointProgress += dt * 0.15; // Adjust speed as needed

		// Check if we should move to next waypoint
		if (this.waypointProgress >= 1) {
			this.waypointProgress = 0;
			this.currentWaypointIndex = nextWaypointIndex;
		}

		// Calculate target CFrame by lerping between waypoints
		const targetCFrame = currentWaypoint.CFrame.Lerp(nextWaypoint.CFrame, this.waypointProgress);

		// Smoothly move camera toward target
		this.currentShowcaseCFrame = this.currentShowcaseCFrame.Lerp(
			targetCFrame,
			RaceConfig.SHOWCASE_CAMERA_LERP,
		);

		// Apply to camera
		this.camera!.CFrame = this.currentShowcaseCFrame;
	}

	private updateTransitionCamera(_dt: number): void {
		if (!this.camera || !this.ballSphere) {
			// No ball yet, just wait
			return;
		}

		const elapsed = tick() - this.transitionStartTime;
		this.transitionProgress = math.clamp(elapsed / RaceConfig.CAMERA_TRANSITION_DURATION, 0, 1);

		// Use smooth easing (ease out cubic)
		const easedProgress = 1 - math.pow(1 - this.transitionProgress, 3);

		// Get target camera position behind the ball
		const targetCFrame = this.getTargetPlayerCFrame();

		// Lerp from start to target
		const currentCFrame = this.transitionStartCFrame.Lerp(targetCFrame, easedProgress);
		this.camera.CFrame = currentCFrame;

		// Check if transition is complete
		if (this.transitionProgress >= 1) {
			print(`${LOG_PREFIX} Camera transition complete`);
			this.finalizePlayerCamera();
		}
	}
}

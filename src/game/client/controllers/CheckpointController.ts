import { Controller, OnStart } from "@flamework/core";
import { CollectionService, Players, RunService, Workspace } from "@rbxts/services";
import { RaceConfig } from "shared/constants/RaceConfig";
import { TAGS } from "shared/globals";
import { ClientEvents } from "game/client/network";
import { RaceServerEvents, RaceClientEvents } from "game/client/network";

const LOG_PREFIX = "[CheckpointController]";

@Controller()
export class CheckpointController implements OnStart {
	private player = Players.LocalPlayer;
	private sphere?: BasePart;
	private respawnBarrierY: number = RaceConfig.DEFAULT_RESPAWN_BARRIER_Y;
	private isRespawning = false;
	private checkpointConnections: RBXScriptConnection[] = [];

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		// Load world config
		this.loadWorldConfig();

		// Setup checkpoints
		this.setupCheckpoints();

		// Listen for ball ready
		ClientEvents.ballReady.connect((ball) => {
			this.onBallReady(ball);
		});

		// Listen for respawn completed
		RaceClientEvents.respawnCompleted.connect(() => {
			// Zero velocity on client side (client owns physics)
			if (this.sphere) {
				this.sphere.AssemblyLinearVelocity = Vector3.zero;
				this.sphere.AssemblyAngularVelocity = Vector3.zero;
			}
			this.isRespawning = false;
		});

		// Start death barrier check loop
		RunService.Heartbeat.Connect(() => this.checkDeathBarrier());
	}

	private loadWorldConfig(): void {
		// Read respawn barrier Y from Map folder attribute
		const mapFolder = Workspace.FindFirstChild("Map") as Folder | undefined;
		if (mapFolder) {
			const barrierY = mapFolder.GetAttribute("RespawnBarrierY") as number | undefined;
			if (barrierY !== undefined) {
				this.respawnBarrierY = barrierY;
				print(`${LOG_PREFIX} RespawnBarrierY attribute found: ${this.respawnBarrierY}`);
			} else {
				print(`${LOG_PREFIX} RespawnBarrierY attribute not set on Map folder, using default: ${this.respawnBarrierY}`);
			}
		} else {
			print(`${LOG_PREFIX} No Map folder found, using default RespawnBarrierY: ${this.respawnBarrierY}`);
		}
	}

	private onBallReady(ball: Model): void {
		this.sphere = ball.FindFirstChild("Sphere") as BasePart;
		this.isRespawning = false;
	}

	private setupCheckpoints(): void {
		// Clear existing connections
		for (const connection of this.checkpointConnections) {
			connection.Disconnect();
		}
		this.checkpointConnections = [];

		// Find RaceCheckpoints folder
		const checkpointFolders = CollectionService.GetTagged(TAGS.RACE_CHECKPOINTS);
		if (checkpointFolders.size() === 0) {
			print(`${LOG_PREFIX} No RaceCheckpoints folder found`);
			return;
		}

		const checkpointsFolder = checkpointFolders[0] as Folder;

		// Setup Touched events on each checkpoint
		for (const child of checkpointsFolder.GetChildren()) {
			if (!child.IsA("BasePart")) continue;

			const checkpointNumber = child.GetAttribute("CheckpointNumber") as number | undefined;
			if (checkpointNumber === undefined) continue;

			const connection = child.Touched.Connect((hit) => {
				this.onCheckpointTouched(checkpointNumber, hit);
			});
			this.checkpointConnections.push(connection);
		}

		print(`${LOG_PREFIX} Setup ${this.checkpointConnections.size()} checkpoint listeners`);

		// Handle runtime changes
		CollectionService.GetInstanceAddedSignal(TAGS.RACE_CHECKPOINTS).Connect(() => {
			this.setupCheckpoints();
		});
	}

	private onCheckpointTouched(checkpointNumber: number, hit: BasePart): void {
		// Only react to our ball's sphere
		if (!this.sphere || hit !== this.sphere) return;

		// Fire to server
		RaceServerEvents.checkpointCrossed.fire(checkpointNumber);
	}

	private checkDeathBarrier(): void {
		if (!this.sphere || this.isRespawning) return;

		if (this.sphere.Position.Y < this.respawnBarrierY) {
			this.isRespawning = true;
			// Zero velocity immediately on client (client owns physics)
			this.sphere.AssemblyLinearVelocity = Vector3.zero;
			this.sphere.AssemblyAngularVelocity = Vector3.zero;
			RaceServerEvents.requestRespawn.fire();
		}
	}
}

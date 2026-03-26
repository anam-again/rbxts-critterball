import { Controller, OnStart, Dependency } from "@flamework/core";
import { Players, CollectionService } from "@rbxts/services";
import { TAGS } from "shared/globals";
import { QueueUIController } from "./QueueUIController";

@Controller()
export class LobbyController implements OnStart {
	private player = Players.LocalPlayer;
	private queueUIController = Dependency<QueueUIController>();

	onStart(): void {
		print("Lobby Client Started!");

		// Set up terminal interactions
		this.setupTerminalInteractions();
	}

	private setupTerminalInteractions(): void {
		// Handle existing terminals
		for (const terminal of CollectionService.GetTagged(TAGS.QUEUE_TERMINAL)) {
			this.setupTerminalPrompt(terminal as BasePart);
		}

		// Handle new terminals added at runtime
		CollectionService.GetInstanceAddedSignal(TAGS.QUEUE_TERMINAL).Connect((terminal) => {
			this.setupTerminalPrompt(terminal as BasePart);
		});
	}

	private setupTerminalPrompt(terminal: BasePart): void {
		// Check if terminal already has a prompt
		let prompt = terminal.FindFirstChildOfClass("ProximityPrompt");

		if (!prompt) {
			// Create ProximityPrompt
			prompt = new Instance("ProximityPrompt");
			prompt.ObjectText = "Queue Terminal";
			prompt.ActionText = "Open Queue";
			prompt.HoldDuration = 0;
			prompt.MaxActivationDistance = 10;
			prompt.RequiresLineOfSight = false;
			prompt.Parent = terminal;
		}

		// Connect to prompt triggered
		prompt.Triggered.Connect((playerWhoTriggered) => {
			if (playerWhoTriggered === this.player) {
				this.queueUIController.showUI();
			}
		});
	}
}

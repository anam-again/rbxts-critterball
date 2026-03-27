import { Controller, OnStart } from "@flamework/core";
import { Players, RunService } from "@rbxts/services";
import { RaceConfig } from "shared/constants/RaceConfig";
import { PlayerRaceState } from "shared/types/RaceTypes";
import { RaceClientEvents } from "game/client/network";

const LOG_PREFIX = "[RaceUIController]";

@Controller()
export class RaceUIController implements OnStart {
	private player = Players.LocalPlayer;
	private playerGui = this.player.WaitForChild("PlayerGui") as PlayerGui;

	private raceState?: PlayerRaceState;

	// UI references
	private screenGui?: ScreenGui;
	private hudFrame?: Frame;
	private totalTimeLabel?: TextLabel;
	private lapTimeLabel?: TextLabel;
	private lapCheckpointLabel?: TextLabel;
	private finishOverlay?: Frame;
	private finishTimeLabel?: TextLabel;

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		// Create UI
		this.createRaceUI();
		this.createFinishOverlay();

		// Listen for race events
		RaceClientEvents.raceStarted.connect(() => {
			print(`${LOG_PREFIX} Race started`);
		});

		RaceClientEvents.raceStateUpdated.connect((state) => {
			this.raceState = state;
			this.updateDisplay();

			if (state.isFinished) {
				task.delay(RaceConfig.FINISH_SCREEN_DELAY, () => {
					this.showFinishScreen();
				});
			}
		});

		// Update timers every frame
		RunService.RenderStepped.Connect(() => this.updateTimers());
	}

	private createRaceUI(): void {
		// Create ScreenGui
		this.screenGui = new Instance("ScreenGui");
		this.screenGui.Name = "RaceUI";
		this.screenGui.ResetOnSpawn = false;
		this.screenGui.IgnoreGuiInset = true;
		this.screenGui.Parent = this.playerGui;

		// Create HUD frame (top-right)
		this.hudFrame = new Instance("Frame");
		this.hudFrame.Name = "RaceHUD";
		this.hudFrame.AnchorPoint = new Vector2(1, 0);
		this.hudFrame.Position = new UDim2(1, -RaceConfig.RACE_HUD_RIGHT_OFFSET, 0, RaceConfig.RACE_HUD_TOP_OFFSET);
		this.hudFrame.Size = new UDim2(0, RaceConfig.RACE_HUD_WIDTH, 0, 0); // Auto-size height
		this.hudFrame.AutomaticSize = Enum.AutomaticSize.Y;
		this.hudFrame.BackgroundColor3 = new Color3(
			RaceConfig.HUD_BACKGROUND_COLOR[0] / 255,
			RaceConfig.HUD_BACKGROUND_COLOR[1] / 255,
			RaceConfig.HUD_BACKGROUND_COLOR[2] / 255,
		);
		this.hudFrame.BackgroundTransparency = RaceConfig.HUD_BACKGROUND_TRANSPARENCY;
		this.hudFrame.BorderSizePixel = 0;
		this.hudFrame.Parent = this.screenGui;

		// Add corner rounding
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0, 8);
		corner.Parent = this.hudFrame;

		// Add padding
		const padding = new Instance("UIPadding");
		padding.PaddingTop = new UDim(0, RaceConfig.RACE_HUD_PADDING);
		padding.PaddingBottom = new UDim(0, RaceConfig.RACE_HUD_PADDING);
		padding.PaddingLeft = new UDim(0, RaceConfig.RACE_HUD_PADDING);
		padding.PaddingRight = new UDim(0, RaceConfig.RACE_HUD_PADDING);
		padding.Parent = this.hudFrame;

		// Add layout
		const layout = new Instance("UIListLayout");
		layout.FillDirection = Enum.FillDirection.Vertical;
		layout.HorizontalAlignment = Enum.HorizontalAlignment.Right;
		layout.VerticalAlignment = Enum.VerticalAlignment.Top;
		layout.Padding = new UDim(0, 4);
		layout.Parent = this.hudFrame;

		// Total time label (large)
		this.totalTimeLabel = new Instance("TextLabel");
		this.totalTimeLabel.Name = "TotalTime";
		this.totalTimeLabel.Size = new UDim2(1, 0, 0, RaceConfig.TIMER_FONT_SIZE);
		this.totalTimeLabel.BackgroundTransparency = 1;
		this.totalTimeLabel.Font = Enum.Font.GothamBold;
		this.totalTimeLabel.TextSize = RaceConfig.TIMER_FONT_SIZE;
		this.totalTimeLabel.TextColor3 = new Color3(
			RaceConfig.TIMER_COLOR[0] / 255,
			RaceConfig.TIMER_COLOR[1] / 255,
			RaceConfig.TIMER_COLOR[2] / 255,
		);
		this.totalTimeLabel.TextXAlignment = Enum.TextXAlignment.Right;
		this.totalTimeLabel.Text = "00:00.00";
		this.totalTimeLabel.Parent = this.hudFrame;

		// Lap time label (smaller)
		this.lapTimeLabel = new Instance("TextLabel");
		this.lapTimeLabel.Name = "LapTime";
		this.lapTimeLabel.Size = new UDim2(1, 0, 0, RaceConfig.LAP_TIMER_FONT_SIZE);
		this.lapTimeLabel.BackgroundTransparency = 1;
		this.lapTimeLabel.Font = Enum.Font.Gotham;
		this.lapTimeLabel.TextSize = RaceConfig.LAP_TIMER_FONT_SIZE;
		this.lapTimeLabel.TextColor3 = new Color3(
			RaceConfig.LAP_TIMER_COLOR[0] / 255,
			RaceConfig.LAP_TIMER_COLOR[1] / 255,
			RaceConfig.LAP_TIMER_COLOR[2] / 255,
		);
		this.lapTimeLabel.TextXAlignment = Enum.TextXAlignment.Right;
		this.lapTimeLabel.Text = "Lap: 00:00.00";
		this.lapTimeLabel.Parent = this.hudFrame;

		// Lap/Checkpoint label
		this.lapCheckpointLabel = new Instance("TextLabel");
		this.lapCheckpointLabel.Name = "LapCheckpoint";
		this.lapCheckpointLabel.Size = new UDim2(1, 0, 0, RaceConfig.LAP_CHECKPOINT_FONT_SIZE);
		this.lapCheckpointLabel.BackgroundTransparency = 1;
		this.lapCheckpointLabel.Font = Enum.Font.Gotham;
		this.lapCheckpointLabel.TextSize = RaceConfig.LAP_CHECKPOINT_FONT_SIZE;
		this.lapCheckpointLabel.TextColor3 = new Color3(
			RaceConfig.LAP_CHECKPOINT_COLOR[0] / 255,
			RaceConfig.LAP_CHECKPOINT_COLOR[1] / 255,
			RaceConfig.LAP_CHECKPOINT_COLOR[2] / 255,
		);
		this.lapCheckpointLabel.TextXAlignment = Enum.TextXAlignment.Right;
		this.lapCheckpointLabel.Text = "Lap 1/3  0/0";
		this.lapCheckpointLabel.Parent = this.hudFrame;
	}

	private createFinishOverlay(): void {
		if (!this.screenGui) return;

		// Create finish overlay (hidden initially)
		this.finishOverlay = new Instance("Frame");
		this.finishOverlay.Name = "FinishOverlay";
		this.finishOverlay.Size = UDim2.fromScale(1, 1);
		this.finishOverlay.BackgroundColor3 = new Color3(0, 0, 0);
		this.finishOverlay.BackgroundTransparency = RaceConfig.FINISH_OVERLAY_TRANSPARENCY;
		this.finishOverlay.BorderSizePixel = 0;
		this.finishOverlay.Visible = false;
		this.finishOverlay.Parent = this.screenGui;

		// Finish title
		const finishTitle = new Instance("TextLabel");
		finishTitle.Name = "FinishTitle";
		finishTitle.AnchorPoint = new Vector2(0.5, 0.5);
		finishTitle.Position = UDim2.fromScale(0.5, 0.4);
		finishTitle.Size = UDim2.fromScale(1, 0);
		finishTitle.AutomaticSize = Enum.AutomaticSize.Y;
		finishTitle.BackgroundTransparency = 1;
		finishTitle.Font = Enum.Font.GothamBold;
		finishTitle.TextSize = RaceConfig.FINISH_TITLE_FONT_SIZE;
		finishTitle.TextColor3 = new Color3(
			RaceConfig.FINISH_TITLE_COLOR[0] / 255,
			RaceConfig.FINISH_TITLE_COLOR[1] / 255,
			RaceConfig.FINISH_TITLE_COLOR[2] / 255,
		);
		finishTitle.Text = "FINISH!";
		finishTitle.Parent = this.finishOverlay;

		// Final time
		this.finishTimeLabel = new Instance("TextLabel");
		this.finishTimeLabel.Name = "FinishTime";
		this.finishTimeLabel.AnchorPoint = new Vector2(0.5, 0.5);
		this.finishTimeLabel.Position = UDim2.fromScale(0.5, 0.55);
		this.finishTimeLabel.Size = UDim2.fromScale(1, 0);
		this.finishTimeLabel.AutomaticSize = Enum.AutomaticSize.Y;
		this.finishTimeLabel.BackgroundTransparency = 1;
		this.finishTimeLabel.Font = Enum.Font.GothamBold;
		this.finishTimeLabel.TextSize = RaceConfig.FINISH_TIME_FONT_SIZE;
		this.finishTimeLabel.TextColor3 = new Color3(
			RaceConfig.FINISH_TIME_COLOR[0] / 255,
			RaceConfig.FINISH_TIME_COLOR[1] / 255,
			RaceConfig.FINISH_TIME_COLOR[2] / 255,
		);
		this.finishTimeLabel.Text = "00:00.00";
		this.finishTimeLabel.Parent = this.finishOverlay;
	}

	private formatTime(seconds: number): string {
		const mins = math.floor(seconds / 60);
		const secs = seconds % 60;
		return string.format("%02d:%05.2f", mins, secs);
	}

	private updateTimers(): void {
		if (!this.raceState || this.raceState.isFinished) return;

		const now = tick();

		// Update total time
		const totalTime = now - this.raceState.raceStartTime;
		if (this.totalTimeLabel) {
			this.totalTimeLabel.Text = this.formatTime(totalTime);
		}

		// Update lap time
		const lapTime = now - this.raceState.lapStartTime;
		if (this.lapTimeLabel) {
			this.lapTimeLabel.Text = `Lap: ${this.formatTime(lapTime)}`;
		}
	}

	private updateDisplay(): void {
		if (!this.raceState) return;

		// Update lap/checkpoint display
		if (this.lapCheckpointLabel) {
			this.lapCheckpointLabel.Text = `Lap ${this.raceState.currentLap}/${this.raceState.totalLaps}  ${this.raceState.currentCheckpoint}/${this.raceState.totalCheckpoints}`;
		}

		// If finished, update final time display
		if (this.raceState.isFinished && this.raceState.finishTime !== undefined) {
			if (this.totalTimeLabel) {
				this.totalTimeLabel.Text = this.formatTime(this.raceState.finishTime);
			}
		}
	}

	private showFinishScreen(): void {
		if (!this.finishOverlay || !this.finishTimeLabel || !this.raceState) return;

		// Set final time
		if (this.raceState.finishTime !== undefined) {
			this.finishTimeLabel.Text = this.formatTime(this.raceState.finishTime);
		}

		// Show overlay
		this.finishOverlay.Visible = true;
	}
}

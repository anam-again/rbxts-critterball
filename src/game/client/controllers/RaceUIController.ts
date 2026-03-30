import { Controller, OnStart, Dependency } from "@flamework/core";
import { Players, RunService, TweenService } from "@rbxts/services";
import { RaceConfig, RaceColors } from "shared/constants/RaceConfig";
import { PlayerRaceState, RaceGameState } from "shared/types/RaceTypes";
import { GamemodeId } from "shared/types/GameTypes";
import { RaceClientEvents } from "game/client/network";
import { GameModeController } from "./GameModeController";
import { SCREEN_GUI_NAMES } from "shared/constants/UINames";

const LOG_PREFIX = "[RaceUIController]";

@Controller()
export class RaceUIController implements OnStart {
	private gameModeController = Dependency<GameModeController>();
	private player = Players.LocalPlayer;
	private playerGui = this.player.WaitForChild("PlayerGui") as PlayerGui;

	private raceState?: PlayerRaceState;
	private previousLap = 1;
	private gameState: RaceGameState = RaceGameState.WAITING;

	// UI references
	private screenGui?: ScreenGui;
	private hudFrame?: Frame;
	private totalTimeLabel?: TextLabel;
	private lapTimeLabel?: TextLabel;
	private lapCounterLabel?: TextLabel;
	private lapNotificationLabel?: TextLabel;
	private finishOverlay?: Frame;
	private finishTimeLabel?: TextLabel;
	private viewResultsButton?: TextButton;
	private countdownLabel?: TextLabel;
	private countdownScale?: UIScale;
	private statusLabel?: TextLabel;

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		// Wait for gamemode to be ready before initializing UI
		this.gameModeController.onGamemodeReady((gamemodeId) => {
			if (gamemodeId === GamemodeId.SANDBOX) {
				print(`${LOG_PREFIX} Sandbox mode - skipping race UI`);
				return;
			}

			this.initializeRaceUI();
		});
	}

	private initializeRaceUI(): void {
		// Create UI
		this.createRaceUI();
		this.createLapNotification();
		this.createFinishOverlay();
		this.createCountdownUI();
		this.createStatusUI();

		// Hide HUD initially (will show when race starts)
		if (this.hudFrame) {
			this.hudFrame.Visible = false;
		}

		// Show "Waiting for players" initially
		this.updateStatusText("waiting");

		// Listen for race events
		RaceClientEvents.raceStarted.connect(() => {
			print(`${LOG_PREFIX} Race started`);
			this.previousLap = 1;

			// Show HUD when race starts
			if (this.hudFrame) {
				this.hudFrame.Visible = true;
			}

			// Hide status label
			this.hideStatusLabel();
		});

		RaceClientEvents.countdownStarted.connect(() => {
			print(`${LOG_PREFIX} Countdown started`);
			// Hide status label when countdown starts
			this.hideStatusLabel();
			this.startCountdown();
		});

		RaceClientEvents.gameStateChanged.connect((state) => {
			print(`${LOG_PREFIX} Game state changed: ${state}`);
			this.gameState = state;

			// Update status label based on state
			if (state === RaceGameState.WAITING) {
				this.updateStatusText("waiting");
			} else if (state === RaceGameState.STARTING) {
				this.updateStatusText("starting");
			}
		});

		RaceClientEvents.allPlayersLoaded.connect(() => {
			print(`${LOG_PREFIX} All players loaded - hiding waiting message`);
			// Hide "Waiting for players" since we're no longer waiting
			this.hideStatusLabel();
		});

		RaceClientEvents.raceStateUpdated.connect((state) => {
			const oldState = this.raceState;
			this.raceState = state;
			this.updateDisplay();

			// Check for lap completion (lap increased but not finished)
			if (oldState && state.currentLap > oldState.currentLap && !state.isFinished) {
				this.showLapNotification(state.currentLap);
			}

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
		this.screenGui.Name = SCREEN_GUI_NAMES.RACE_UI;
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
		this.hudFrame.BackgroundColor3 = RaceColors.HUD_BACKGROUND;
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

		// Total time label (large, monospace)
		this.totalTimeLabel = new Instance("TextLabel");
		this.totalTimeLabel.Name = "TotalTime";
		this.totalTimeLabel.Size = new UDim2(1, 0, 0, RaceConfig.TIMER_FONT_SIZE);
		this.totalTimeLabel.BackgroundTransparency = 1;
		this.totalTimeLabel.Font = Enum.Font.RobotoMono;
		this.totalTimeLabel.TextSize = RaceConfig.TIMER_FONT_SIZE;
		this.totalTimeLabel.TextColor3 = RaceColors.TIMER;
		this.totalTimeLabel.TextXAlignment = Enum.TextXAlignment.Right;
		this.totalTimeLabel.Text = "00:00.00";
		this.totalTimeLabel.Parent = this.hudFrame;

		// Lap time label (smaller, monospace)
		this.lapTimeLabel = new Instance("TextLabel");
		this.lapTimeLabel.Name = "LapTime";
		this.lapTimeLabel.Size = new UDim2(1, 0, 0, RaceConfig.LAP_TIMER_FONT_SIZE);
		this.lapTimeLabel.BackgroundTransparency = 1;
		this.lapTimeLabel.Font = Enum.Font.RobotoMono;
		this.lapTimeLabel.TextSize = RaceConfig.LAP_TIMER_FONT_SIZE;
		this.lapTimeLabel.TextColor3 = RaceColors.LAP_TIMER;
		this.lapTimeLabel.TextXAlignment = Enum.TextXAlignment.Right;
		this.lapTimeLabel.Text = "Lap: 00:00.00";
		this.lapTimeLabel.Parent = this.hudFrame;

		// Lap counter label (no checkpoint)
		this.lapCounterLabel = new Instance("TextLabel");
		this.lapCounterLabel.Name = "LapCounter";
		this.lapCounterLabel.Size = new UDim2(1, 0, 0, RaceConfig.LAP_COUNTER_FONT_SIZE);
		this.lapCounterLabel.BackgroundTransparency = 1;
		this.lapCounterLabel.Font = Enum.Font.RobotoMono;
		this.lapCounterLabel.TextSize = RaceConfig.LAP_COUNTER_FONT_SIZE;
		this.lapCounterLabel.TextColor3 = RaceColors.LAP_COUNTER;
		this.lapCounterLabel.TextXAlignment = Enum.TextXAlignment.Right;
		this.lapCounterLabel.Text = "Lap 1/3";
		this.lapCounterLabel.Parent = this.hudFrame;

		// View Results button (hidden until race finishes)
		this.viewResultsButton = new Instance("TextButton");
		this.viewResultsButton.Name = "ViewResultsButton";
		this.viewResultsButton.Size = new UDim2(1, 0, 0, 28);
		this.viewResultsButton.BackgroundColor3 = new Color3(0.15, 0.15, 0.15);
		this.viewResultsButton.BackgroundTransparency = 0.3;
		this.viewResultsButton.BorderSizePixel = 0;
		this.viewResultsButton.Font = Enum.Font.Gotham;
		this.viewResultsButton.TextSize = 14;
		this.viewResultsButton.TextColor3 = new Color3(1, 1, 1);
		this.viewResultsButton.Text = "View Results";
		this.viewResultsButton.Visible = false;
		this.viewResultsButton.Parent = this.hudFrame;

		// Add corner rounding
		const resultsButtonCorner = new Instance("UICorner");
		resultsButtonCorner.CornerRadius = new UDim(0, 4);
		resultsButtonCorner.Parent = this.viewResultsButton;

		// View Results click handler
		this.viewResultsButton.MouseButton1Click.Connect(() => {
			if (this.finishOverlay) {
				this.finishOverlay.Visible = true;
			}
		});
	}

	private createLapNotification(): void {
		if (!this.screenGui) return;

		// Create centered lap notification label (hidden initially)
		this.lapNotificationLabel = new Instance("TextLabel");
		this.lapNotificationLabel.Name = "LapNotification";
		this.lapNotificationLabel.AnchorPoint = new Vector2(0.5, 0.5);
		this.lapNotificationLabel.Position = UDim2.fromScale(0.5, 0.35);
		this.lapNotificationLabel.Size = UDim2.fromScale(1, 0);
		this.lapNotificationLabel.AutomaticSize = Enum.AutomaticSize.Y;
		this.lapNotificationLabel.BackgroundTransparency = 1;
		this.lapNotificationLabel.Font = Enum.Font.GothamBold;
		this.lapNotificationLabel.TextSize = RaceConfig.LAP_NOTIFICATION_FONT_SIZE;
		this.lapNotificationLabel.TextColor3 = RaceColors.LAP_NOTIFICATION;
		this.lapNotificationLabel.TextStrokeTransparency = 0.5;
		this.lapNotificationLabel.TextStrokeColor3 = new Color3(0, 0, 0);
		this.lapNotificationLabel.Text = "";
		this.lapNotificationLabel.TextTransparency = 1;
		this.lapNotificationLabel.Parent = this.screenGui;

		// Add UIScale for animation
		const scale = new Instance("UIScale");
		scale.Name = "NotificationScale";
		scale.Scale = 0.5;
		scale.Parent = this.lapNotificationLabel;
	}

	private showLapNotification(lapNumber: number): void {
		if (!this.lapNotificationLabel || !this.raceState) return;

		const scale = this.lapNotificationLabel.FindFirstChild("NotificationScale") as UIScale | undefined;
		if (!scale) return;

		// Set text - show "Final Lap!" for the last lap
		if (lapNumber === this.raceState.totalLaps) {
			this.lapNotificationLabel.Text = "Final Lap!";
		} else {
			this.lapNotificationLabel.Text = `Lap ${lapNumber}`;
		}

		// Reset state
		this.lapNotificationLabel.TextTransparency = 1;
		scale.Scale = 0.5;

		// Animate in
		const tweenIn = TweenService.Create(
			this.lapNotificationLabel,
			new TweenInfo(RaceConfig.LAP_NOTIFICATION_ANIMATE_IN_TIME, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
			{ TextTransparency: 0 },
		);
		const scaleIn = TweenService.Create(
			scale,
			new TweenInfo(RaceConfig.LAP_NOTIFICATION_ANIMATE_IN_TIME, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
			{ Scale: 1 },
		);

		tweenIn.Play();
		scaleIn.Play();

		// Hold, then animate out
		task.delay(RaceConfig.LAP_NOTIFICATION_ANIMATE_IN_TIME + RaceConfig.LAP_NOTIFICATION_HOLD_TIME, () => {
			const tweenOut = TweenService.Create(
				this.lapNotificationLabel!,
				new TweenInfo(RaceConfig.LAP_NOTIFICATION_ANIMATE_OUT_TIME, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
				{ TextTransparency: 1 },
			);
			const scaleOut = TweenService.Create(
				scale,
				new TweenInfo(RaceConfig.LAP_NOTIFICATION_ANIMATE_OUT_TIME, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
				{ Scale: 1.2 },
			);

			tweenOut.Play();
			scaleOut.Play();
		});
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
		finishTitle.TextColor3 = RaceColors.FINISH_TITLE;
		finishTitle.Text = "FINISH!";
		finishTitle.Parent = this.finishOverlay;

		// Final time (monospace)
		this.finishTimeLabel = new Instance("TextLabel");
		this.finishTimeLabel.Name = "FinishTime";
		this.finishTimeLabel.AnchorPoint = new Vector2(0.5, 0.5);
		this.finishTimeLabel.Position = UDim2.fromScale(0.5, 0.55);
		this.finishTimeLabel.Size = UDim2.fromScale(1, 0);
		this.finishTimeLabel.AutomaticSize = Enum.AutomaticSize.Y;
		this.finishTimeLabel.BackgroundTransparency = 1;
		this.finishTimeLabel.Font = Enum.Font.RobotoMono;
		this.finishTimeLabel.TextSize = RaceConfig.FINISH_TIME_FONT_SIZE;
		this.finishTimeLabel.TextColor3 = RaceColors.FINISH_TIME;
		this.finishTimeLabel.Text = "00:00.00";
		this.finishTimeLabel.Parent = this.finishOverlay;

		// Close button
		const closeButton = new Instance("TextButton");
		closeButton.Name = "CloseButton";
		closeButton.AnchorPoint = new Vector2(0.5, 0.5);
		closeButton.Position = UDim2.fromScale(0.5, 0.7);
		closeButton.Size = new UDim2(0, 120, 0, 40);
		closeButton.BackgroundColor3 = new Color3(0.2, 0.2, 0.2);
		closeButton.BackgroundTransparency = 0.3;
		closeButton.BorderSizePixel = 0;
		closeButton.Font = Enum.Font.GothamBold;
		closeButton.TextSize = 20;
		closeButton.TextColor3 = new Color3(1, 1, 1);
		closeButton.Text = "Close";
		closeButton.Parent = this.finishOverlay;

		// Add corner rounding to button
		const buttonCorner = new Instance("UICorner");
		buttonCorner.CornerRadius = new UDim(0, 6);
		buttonCorner.Parent = closeButton;

		// Close button click handler
		closeButton.MouseButton1Click.Connect(() => {
			if (this.finishOverlay) {
				this.finishOverlay.Visible = false;
			}
		});
	}

	private createCountdownUI(): void {
		if (!this.screenGui) return;

		// Create centered countdown label
		this.countdownLabel = new Instance("TextLabel");
		this.countdownLabel.Name = "Countdown";
		this.countdownLabel.AnchorPoint = new Vector2(0.5, 0.5);
		this.countdownLabel.Position = UDim2.fromScale(0.5, 0.45);
		this.countdownLabel.Size = UDim2.fromScale(1, 0);
		this.countdownLabel.AutomaticSize = Enum.AutomaticSize.Y;
		this.countdownLabel.BackgroundTransparency = 1;
		this.countdownLabel.Font = Enum.Font.GothamBold;
		this.countdownLabel.TextSize = RaceConfig.COUNTDOWN_FONT_SIZE;
		this.countdownLabel.TextColor3 = RaceColors.COUNTDOWN;
		this.countdownLabel.TextStrokeTransparency = 0.3;
		this.countdownLabel.TextStrokeColor3 = new Color3(0, 0, 0);
		this.countdownLabel.Text = "";
		this.countdownLabel.TextTransparency = 1;
		this.countdownLabel.Parent = this.screenGui;

		// Add UIScale for animation
		this.countdownScale = new Instance("UIScale");
		this.countdownScale.Name = "CountdownScale";
		this.countdownScale.Scale = 1;
		this.countdownScale.Parent = this.countdownLabel;
	}

	private startCountdown(): void {
		// Countdown: 5, 4, 3, 2, 1, Race!
		for (let i = RaceConfig.COUNTDOWN_DURATION; i >= 1; i--) {
			const delay = RaceConfig.COUNTDOWN_DURATION - i;
			task.delay(delay, () => {
				this.showCountdownNumber(i);
			});
		}

		// Show "Race!" at the end
		task.delay(RaceConfig.COUNTDOWN_DURATION, () => {
			this.showCountdownGo();
		});
	}

	private showCountdownNumber(num: number): void {
		if (!this.countdownLabel || !this.countdownScale) return;

		// Set text and color
		this.countdownLabel.Text = tostring(num);
		this.countdownLabel.TextColor3 = RaceColors.COUNTDOWN;

		// Reset state for animation
		this.countdownLabel.TextTransparency = 0;
		this.countdownScale.Scale = 1.5;

		// Animate scale down and fade
		const scaleTween = TweenService.Create(
			this.countdownScale,
			new TweenInfo(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
			{ Scale: 1 },
		);
		const fadeTween = TweenService.Create(
			this.countdownLabel,
			new TweenInfo(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ TextTransparency: 0.3 },
		);

		scaleTween.Play();
		fadeTween.Play();
	}

	private showCountdownGo(): void {
		if (!this.countdownLabel || !this.countdownScale) return;

		// Set text to "Race!" with gold color
		this.countdownLabel.Text = RaceConfig.COUNTDOWN_GO_TEXT;
		this.countdownLabel.TextColor3 = RaceColors.COUNTDOWN_GO;

		// Reset state for animation
		this.countdownLabel.TextTransparency = 0;
		this.countdownScale.Scale = 2;

		// Animate scale down
		const scaleTween = TweenService.Create(
			this.countdownScale,
			new TweenInfo(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
			{ Scale: 1 },
		);
		scaleTween.Play();

		// Hold then fade out
		task.delay(0.5, () => {
			if (!this.countdownLabel || !this.countdownScale) return;

			const fadeOutTween = TweenService.Create(
				this.countdownLabel,
				new TweenInfo(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
				{ TextTransparency: 1 },
			);
			const scaleOutTween = TweenService.Create(
				this.countdownScale,
				new TweenInfo(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
				{ Scale: 1.5 },
			);

			fadeOutTween.Play();
			scaleOutTween.Play();
		});
	}

	private createStatusUI(): void {
		if (!this.screenGui) return;

		// Create centered status label for "Waiting for players" / "Race about to start"
		this.statusLabel = new Instance("TextLabel");
		this.statusLabel.Name = "StatusLabel";
		this.statusLabel.AnchorPoint = new Vector2(0.5, 0.5);
		this.statusLabel.Position = UDim2.fromScale(0.5, 0.5);
		this.statusLabel.Size = UDim2.fromScale(1, 0);
		this.statusLabel.AutomaticSize = Enum.AutomaticSize.Y;
		this.statusLabel.BackgroundTransparency = 1;
		this.statusLabel.Font = Enum.Font.GothamBold;
		this.statusLabel.TextSize = RaceConfig.STATUS_FONT_SIZE;
		this.statusLabel.TextColor3 = RaceColors.STATUS;
		this.statusLabel.TextStrokeTransparency = 0.5;
		this.statusLabel.TextStrokeColor3 = new Color3(0, 0, 0);
		this.statusLabel.Text = "";
		this.statusLabel.TextTransparency = 0;
		this.statusLabel.Parent = this.screenGui;
	}

	private updateStatusText(state: "waiting" | "starting"): void {
		if (!this.statusLabel) return;

		if (state === "waiting") {
			this.statusLabel.Text = RaceConfig.WAITING_TEXT;
		} else if (state === "starting") {
			this.statusLabel.Text = RaceConfig.STARTING_TEXT;
		}

		this.statusLabel.TextTransparency = 0;
	}

	private hideStatusLabel(): void {
		if (!this.statusLabel) return;

		// Fade out the status label
		const fadeOut = TweenService.Create(
			this.statusLabel,
			new TweenInfo(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ TextTransparency: 1 },
		);
		fadeOut.Play();
	}

	private formatTime(seconds: number): string {
		const mins = math.floor(seconds / 60);
		const secs = seconds % 60;
		return string.format("%02d:%05.2f", mins, secs);
	}

	private updateTimers(): void {
		// Only update timers when race is running
		if (this.gameState !== RaceGameState.RACING) return;
		if (!this.raceState || this.raceState.isFinished) return;
		if (this.raceState.raceStartTime === 0) return;

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

		// Update lap counter (no checkpoint)
		if (this.lapCounterLabel) {
			this.lapCounterLabel.Text = `Lap ${this.raceState.currentLap}/${this.raceState.totalLaps}`;
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

		// Show the View Results button in the HUD
		if (this.viewResultsButton) {
			this.viewResultsButton.Visible = true;
		}
	}
}

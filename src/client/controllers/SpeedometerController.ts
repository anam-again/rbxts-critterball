import { Controller, OnStart } from "@flamework/core";
import { Players, RunService } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { ClientEvents } from "client/network";

@Controller()
export class SpeedometerController implements OnStart {
	private player = Players.LocalPlayer;
	private sphere?: BasePart;

	// UI elements
	private screenGui?: ScreenGui;
	private container?: Frame;
	private speedLabel?: TextLabel;
	private speedBarFill?: Frame;
	private speedBarTrail?: Frame;
	private speedBarLead?: Frame;
	private barBackground?: Frame;

	// Bar fill state
	private mainFillRatio = 0;
	private mainLerpSpeed = 5; // How fast the main bar catches up per second
	private trailFillRatio = 0;
	private trailDecayRate = 0.4; // How fast the trail bar decays per second
	private leadFillRatio = 0;
	private leadLerpSpeed = 12; // How fast the lead bar catches up (fastest)

	// Shake state
	private shakeIntensity = 0;
	private shakeTime = 0;
	private previousVelocity = Vector3.zero;
	private basePosition = new UDim2(0.5, 0, 1, -BallConfig.SPEEDOMETER_BOTTOM_OFFSET);

	// Text scaling and thresholds
	private baseTextSize = 28;
	private mediumTextSize = 34;
	private maxTextSize = 42;
	private extremeTextSize = 52;
	private textShakeTime = 0;
	private baseLabelPosition = new UDim2(0, 6, 0, 0);

	// Container sizing
	private baseContainerSize = new UDim2(0, BallConfig.SPEEDOMETER_BAR_WIDTH + 100, 0, BallConfig.SPEEDOMETER_BAR_HEIGHT + 16);
	private extremeContainerSize = new UDim2(0, BallConfig.SPEEDOMETER_BAR_WIDTH + 115, 0, BallConfig.SPEEDOMETER_BAR_HEIGHT + 26);

	// Default bar colors
	private defaultFillColor = new Color3(0.3, 0.75, 0.4);
	private defaultTrailColor = new Color3(0.6, 0.25, 0.25);
	private defaultLeadColor = new Color3(0.25, 0.45, 0.7);
	private extremeBarColor = new Color3(0.5, 0.1, 0.1);

	onStart(): void {
		// Create UI
		this.createSpeedometerUI();

		// Listen for ball ready event
		ClientEvents.ballReady.connect((ball) => {
			this.sphere = ball.FindFirstChild("Sphere") as BasePart;
			if (this.sphere) {
				this.previousVelocity = this.sphere.AssemblyLinearVelocity;
			}
		});

		// Update loop
		RunService.RenderStepped.Connect((dt) => this.updateSpeedometer(dt));
	}

	private createSpeedometerUI(): void {
		const playerGui = this.player.WaitForChild("PlayerGui") as PlayerGui;

		// Create ScreenGui
		const screenGui = new Instance("ScreenGui");
		screenGui.Name = "SpeedometerGui";
		screenGui.ResetOnSpawn = false;
		screenGui.IgnoreGuiInset = true;
		screenGui.Parent = playerGui;
		this.screenGui = screenGui;

		// Container frame at bottom center with background
		const container = new Instance("Frame");
		container.Name = "SpeedometerContainer";
		container.Size = this.baseContainerSize;
		container.Position = this.basePosition;
		container.AnchorPoint = new Vector2(0.5, 1);
		container.BackgroundColor3 = new Color3(0.1, 0.1, 0.1);
		container.BackgroundTransparency = 0.3;
		container.BorderSizePixel = 0;
		container.Parent = screenGui;
		this.container = container;

		// Speed number label (left side)
		const speedLabel = new Instance("TextLabel");
		speedLabel.Name = "SpeedLabel";
		speedLabel.Size = new UDim2(0, 55, 1, 0);
		speedLabel.Position = new UDim2(0, 6, 0, 0);
		speedLabel.BackgroundTransparency = 1;
		speedLabel.Text = "000";
		speedLabel.TextColor3 = new Color3(1, 1, 1);
		speedLabel.TextSize = this.baseTextSize;
		speedLabel.Font = Enum.Font.RobotoMono;
		speedLabel.TextXAlignment = Enum.TextXAlignment.Right;
		speedLabel.Parent = container;
		this.speedLabel = speedLabel;

		// MPH label (small text after speed number)
		const mphLabel = new Instance("TextLabel");
		mphLabel.Name = "MphLabel";
		mphLabel.Size = new UDim2(0, 25, 1, 0);
		mphLabel.Position = new UDim2(0, 62, 0, 0);
		mphLabel.BackgroundTransparency = 1;
		mphLabel.Text = "mph";
		mphLabel.TextColor3 = new Color3(0.7, 0.7, 0.7);
		mphLabel.TextSize = 12;
		mphLabel.Font = Enum.Font.Gotham;
		mphLabel.TextXAlignment = Enum.TextXAlignment.Left;
		mphLabel.TextYAlignment = Enum.TextYAlignment.Center;
		mphLabel.Parent = container;

		// Speed bar background (right side, closer to number)
		const barBackground = new Instance("Frame");
		barBackground.Name = "BarBackground";
		barBackground.Size = new UDim2(0, BallConfig.SPEEDOMETER_BAR_WIDTH, 0, BallConfig.SPEEDOMETER_BAR_HEIGHT);
		barBackground.Position = new UDim2(0, 90, 0.5, 0);
		barBackground.AnchorPoint = new Vector2(0, 0.5);
		barBackground.BackgroundColor3 = new Color3(0.2, 0.2, 0.2);
		barBackground.BorderSizePixel = 0;
		barBackground.Parent = container;
		this.barBackground = barBackground;

		// Leading speed bar (behind everything, shows acceleration)
		const barLead = new Instance("Frame");
		barLead.Name = "BarLead";
		barLead.Size = new UDim2(0, 0, 1, 0);
		barLead.Position = new UDim2(0, 0, 0, 0);
		barLead.BackgroundColor3 = new Color3(0.25, 0.45, 0.7);
		barLead.BorderSizePixel = 0;
		barLead.ZIndex = 1;
		barLead.Parent = barBackground;
		this.speedBarLead = barLead;

		// Trailing speed bar (shows deceleration)
		const barTrail = new Instance("Frame");
		barTrail.Name = "BarTrail";
		barTrail.Size = new UDim2(0, 0, 1, 0);
		barTrail.Position = new UDim2(0, 0, 0, 0);
		barTrail.BackgroundColor3 = new Color3(0.6, 0.25, 0.25);
		barTrail.BorderSizePixel = 0;
		barTrail.ZIndex = 2;
		barTrail.Parent = barBackground;
		this.speedBarTrail = barTrail;

		// Speed bar fill (on top)
		const barFill = new Instance("Frame");
		barFill.Name = "BarFill";
		barFill.Size = new UDim2(0, 0, 1, 0);
		barFill.Position = new UDim2(0, 0, 0, 0);
		barFill.BackgroundColor3 = new Color3(0.3, 0.75, 0.4);
		barFill.BorderSizePixel = 0;
		barFill.ZIndex = 3;
		barFill.Parent = barBackground;
		this.speedBarFill = barFill;
	}

	private updateSpeedometer(dt: number): void {
		if (!this.sphere || !this.speedLabel || !this.speedBarFill || !this.speedBarTrail || !this.speedBarLead || !this.barBackground || !this.container) return;

		// Get current velocity and speed
		const velocity = this.sphere.AssemblyLinearVelocity;
		const horizontalVelocity = new Vector3(velocity.X, 0, velocity.Z);
		const speed = horizontalVelocity.Magnitude;

		// Detect impacts for shake
		const velocityChange = velocity.sub(this.previousVelocity).Magnitude;
		if (velocityChange > BallConfig.SHAKE_IMPACT_VELOCITY_MIN) {
			const impactRatio = math.clamp(
				(velocityChange - BallConfig.SHAKE_IMPACT_VELOCITY_MIN) /
					(BallConfig.SHAKE_IMPACT_VELOCITY_MAX - BallConfig.SHAKE_IMPACT_VELOCITY_MIN),
				0,
				1,
			);
			this.shakeIntensity = math.max(this.shakeIntensity, impactRatio * 8);
		}
		this.previousVelocity = velocity;

		// Calculate displayed speed (2.2x multiplier for dramatic effect)
		const displayedSpeed = speed * 2.2;

		// Update number display with leading zeros (3 digits)
		const speedInt = math.floor(math.clamp(displayedSpeed, 0, 999));
		this.speedLabel.Text = string.format("%03d", speedInt);

		// Update text size, color, shake, and bar colors based on displayed speed thresholds
		// Thresholds adjusted for 2.2x multiplier (same actual speeds as before)
		if (displayedSpeed >= 200) {
			// Extreme speed: dark red everything, very large text, intense shake, larger container
			this.speedLabel.TextSize = this.extremeTextSize;
			this.speedLabel.TextColor3 = new Color3(0.9, 0.15, 0.15);

			// Intense text shake
			this.textShakeTime += dt * 50;
			const textShakeX = math.sin(this.textShakeTime * 2.0) * 4;
			const textShakeY = math.cos(this.textShakeTime * 2.5) * 3;
			this.speedLabel.Position = new UDim2(
				this.baseLabelPosition.X.Scale,
				this.baseLabelPosition.X.Offset + textShakeX,
				this.baseLabelPosition.Y.Scale,
				this.baseLabelPosition.Y.Offset + textShakeY,
			);

			// All bars turn dark red
			this.speedBarFill.BackgroundColor3 = this.extremeBarColor;
			this.speedBarTrail.BackgroundColor3 = this.extremeBarColor;
			this.speedBarLead.BackgroundColor3 = this.extremeBarColor;

			// Larger container with shake
			this.container.Size = this.extremeContainerSize;
			const containerShakeX = math.sin(this.textShakeTime * 1.8) * 3;
			const containerShakeY = math.cos(this.textShakeTime * 2.2) * 2;
			this.container.Position = new UDim2(
				this.basePosition.X.Scale,
				this.basePosition.X.Offset + containerShakeX,
				this.basePosition.Y.Scale,
				this.basePosition.Y.Offset + containerShakeY,
			);
		} else if (displayedSpeed >= 183) {
			// High speed: orange, large size, shaking
			this.speedLabel.TextSize = this.maxTextSize;
			this.speedLabel.TextColor3 = new Color3(1, 0.6, 0.2);

			// Apply text shake
			this.textShakeTime += dt * 30;
			const shakeX = math.sin(this.textShakeTime * 1.5) * 2;
			const shakeY = math.cos(this.textShakeTime * 1.8) * 1.5;
			this.speedLabel.Position = new UDim2(
				this.baseLabelPosition.X.Scale,
				this.baseLabelPosition.X.Offset + shakeX,
				this.baseLabelPosition.Y.Scale,
				this.baseLabelPosition.Y.Offset + shakeY,
			);

			// Reset bar colors and container size
			this.speedBarFill.BackgroundColor3 = this.defaultFillColor;
			this.speedBarTrail.BackgroundColor3 = this.defaultTrailColor;
			this.speedBarLead.BackgroundColor3 = this.defaultLeadColor;
			this.container.Size = this.baseContainerSize;
		} else if (displayedSpeed >= 138) {
			// Medium speed: green, medium size, no shake
			this.speedLabel.TextSize = this.mediumTextSize;
			this.speedLabel.TextColor3 = new Color3(0.3, 0.9, 0.4);
			this.speedLabel.Position = this.baseLabelPosition;

			// Reset bar colors and container size
			this.speedBarFill.BackgroundColor3 = this.defaultFillColor;
			this.speedBarTrail.BackgroundColor3 = this.defaultTrailColor;
			this.speedBarLead.BackgroundColor3 = this.defaultLeadColor;
			this.container.Size = this.baseContainerSize;
		} else {
			// Normal: white, base size, no shake
			this.speedLabel.TextSize = this.baseTextSize;
			this.speedLabel.TextColor3 = new Color3(1, 1, 1);
			this.speedLabel.Position = this.baseLabelPosition;

			// Reset bar colors and container size
			this.speedBarFill.BackgroundColor3 = this.defaultFillColor;
			this.speedBarTrail.BackgroundColor3 = this.defaultTrailColor;
			this.speedBarLead.BackgroundColor3 = this.defaultLeadColor;
			this.container.Size = this.baseContainerSize;
		}

		// Calculate target fill ratio
		const targetFillRatio = math.clamp(speed / BallConfig.SPEEDOMETER_MAX_DISPLAY_SPEED, 0, 1);

		// Update main bar fill with lerping
		const lerpFactor = math.clamp(this.mainLerpSpeed * dt, 0, 1);
		this.mainFillRatio = this.mainFillRatio + (targetFillRatio - this.mainFillRatio) * lerpFactor;
		this.speedBarFill.Size = new UDim2(this.mainFillRatio, 0, 1, 0);

		// Update trailing bar (follows behind, decays slowly when slowing down)
		if (this.mainFillRatio > this.trailFillRatio) {
			// Instantly match if current is higher
			this.trailFillRatio = this.mainFillRatio;
		} else {
			// Slowly decay toward current
			this.trailFillRatio = math.max(this.mainFillRatio, this.trailFillRatio - this.trailDecayRate * dt);
		}
		this.speedBarTrail.Size = new UDim2(this.trailFillRatio, 0, 1, 0);

		// Update leading bar (jumps ahead, lerps down when slowing)
		if (targetFillRatio > this.leadFillRatio) {
			// Instantly jump to target when accelerating
			this.leadFillRatio = targetFillRatio;
		} else {
			// Lerp down quickly when decelerating
			const leadLerpFactor = math.clamp(this.leadLerpSpeed * dt, 0, 1);
			this.leadFillRatio = this.leadFillRatio + (targetFillRatio - this.leadFillRatio) * leadLerpFactor;
		}
		this.speedBarLead.Size = new UDim2(this.leadFillRatio, 0, 1, 0);

		// Apply and decay impact shake (skip if at extreme speed since we handle that above)
		if (displayedSpeed < 200) {
			if (this.shakeIntensity > 0) {
				this.shakeTime += dt * 25;
				const shakeX = math.sin(this.shakeTime * 1.3) * this.shakeIntensity;
				const shakeY = math.cos(this.shakeTime * 1.7) * this.shakeIntensity * 0.5;

				this.container.Position = new UDim2(
					this.basePosition.X.Scale,
					this.basePosition.X.Offset + shakeX,
					this.basePosition.Y.Scale,
					this.basePosition.Y.Offset + shakeY,
				);

				this.shakeIntensity = math.max(0, this.shakeIntensity - 15 * dt);
			} else {
				this.container.Position = this.basePosition;
			}
		} else {
			// Still decay shake intensity even at extreme speed
			this.shakeIntensity = math.max(0, this.shakeIntensity - 15 * dt);
		}
	}
}

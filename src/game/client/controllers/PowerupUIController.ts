import { Controller, OnStart } from "@flamework/core";
import { Players } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { PowerupType } from "../types/PowerupTypes";

export { PowerupType };

@Controller()
export class PowerupUIController implements OnStart {
	private screenGui?: ScreenGui;
	private slotFrame?: Frame;
	private powerupLabel?: TextLabel;
	private keyHintLabel?: TextLabel;

	onStart(): void {
		this.createUI();
	}

	private createUI(): void {
		const player = Players.LocalPlayer;
		const playerGui = player.WaitForChild("PlayerGui") as PlayerGui;

		// Create ScreenGui
		const screenGui = new Instance("ScreenGui");
		screenGui.Name = "PowerupUI";
		screenGui.ResetOnSpawn = false;
		screenGui.IgnoreGuiInset = true;
		screenGui.Parent = playerGui;
		this.screenGui = screenGui;

		// Create slot frame at top-center
		const slotFrame = new Instance("Frame");
		slotFrame.Name = "PowerupSlot";
		slotFrame.Size = new UDim2(0, BallConfig.POWERUP_UI_SIZE, 0, BallConfig.POWERUP_UI_SIZE);
		slotFrame.AnchorPoint = new Vector2(0.5, 0);
		slotFrame.Position = new UDim2(0.5, 0, 0, BallConfig.POWERUP_UI_TOP_OFFSET);
		slotFrame.BackgroundColor3 = new Color3(0.1, 0.1, 0.1);
		slotFrame.BackgroundTransparency = 0.5;
		slotFrame.BorderSizePixel = 0;
		slotFrame.Parent = screenGui;
		this.slotFrame = slotFrame;

		// Add rounded corners
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0, 8);
		corner.Parent = slotFrame;

		// Add subtle border
		const stroke = new Instance("UIStroke");
		stroke.Color = new Color3(0.3, 0.3, 0.3);
		stroke.Thickness = 2;
		stroke.Transparency = 0.5;
		stroke.Parent = slotFrame;

		// Create powerup label (hidden initially)
		const powerupLabel = new Instance("TextLabel");
		powerupLabel.Name = "PowerupLabel";
		powerupLabel.Size = new UDim2(1, -8, 1, -8);
		powerupLabel.Position = new UDim2(0, 4, 0, 4);
		powerupLabel.BackgroundTransparency = 1;
		powerupLabel.TextColor3 = new Color3(1, 1, 1);
		powerupLabel.TextScaled = true;
		powerupLabel.Font = Enum.Font.GothamBold;
		powerupLabel.Text = "";
		powerupLabel.Visible = false;
		powerupLabel.Parent = slotFrame;
		this.powerupLabel = powerupLabel;

		// Add text size constraint
		const textConstraint = new Instance("UITextSizeConstraint");
		textConstraint.MaxTextSize = 14;
		textConstraint.Parent = powerupLabel;

		// Add key hint label at bottom
		const keyHint = new Instance("TextLabel");
		keyHint.Name = "KeyHint";
		keyHint.Size = new UDim2(1, 0, 0, 16);
		keyHint.Position = new UDim2(0, 0, 1, 4);
		keyHint.BackgroundTransparency = 1;
		keyHint.TextColor3 = new Color3(0.7, 0.7, 0.7);
		keyHint.TextSize = 12;
		keyHint.Font = Enum.Font.Gotham;
		keyHint.Text = "[E]";
		keyHint.Visible = false;
		keyHint.Parent = slotFrame;
		this.keyHintLabel = keyHint;
	}

	setPowerup(powerupType: PowerupType): void {
		if (!this.slotFrame || !this.powerupLabel) return;

		if (powerupType === undefined) {
			// Empty slot
			this.powerupLabel.Visible = false;
			this.slotFrame.BackgroundColor3 = new Color3(0.1, 0.1, 0.1);
			this.slotFrame.BackgroundTransparency = 0.5;
			if (this.keyHintLabel) this.keyHintLabel.Visible = false;
		} else if (powerupType === "speed") {
			// Speed boost powerup
			this.powerupLabel.Text = "Speed\nBoost";
			this.powerupLabel.TextColor3 = new Color3(1, 0.8, 0.2);
			this.powerupLabel.Visible = true;
			this.slotFrame.BackgroundColor3 = new Color3(0.3, 0.25, 0.1);
			this.slotFrame.BackgroundTransparency = 0.3;
			if (this.keyHintLabel) this.keyHintLabel.Visible = true;
		}
	}
}

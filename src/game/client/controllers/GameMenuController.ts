import { Controller, OnStart } from "@flamework/core";
import { Players, TweenService } from "@rbxts/services";
import { GameServerEvents } from "game/client/network";

const LOG_PREFIX = "[GameMenuController]";

// Menu configuration
const MENU_CONFIG = {
	BUTTON_SIZE: 40,
	BUTTON_OFFSET: 16,
	BUTTON_ICON: "☰", // Hamburger menu icon
	OVERLAY_TRANSPARENCY: 0.5,
	BUTTON_PADDING: 12,
	MENU_BUTTON_WIDTH: 200,
	MENU_BUTTON_HEIGHT: 50,
	MENU_BUTTON_SPACING: 12,
} as const;

@Controller()
export class GameMenuController implements OnStart {
	private player = Players.LocalPlayer;
	private playerGui = this.player.WaitForChild("PlayerGui") as PlayerGui;

	// UI references
	private screenGui?: ScreenGui;
	private menuButton?: TextButton;
	private overlay?: Frame;
	private isOverlayVisible = false;

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		this.createMenuUI();
	}

	private createMenuUI(): void {
		// Create ScreenGui
		this.screenGui = new Instance("ScreenGui");
		this.screenGui.Name = "GameMenuUI";
		this.screenGui.ResetOnSpawn = false;
		this.screenGui.IgnoreGuiInset = true;
		this.screenGui.DisplayOrder = 100; // Above other UI
		this.screenGui.Parent = this.playerGui;

		// Create menu button (top-left)
		this.createMenuButton();

		// Create overlay
		this.createOverlay();
	}

	private createMenuButton(): void {
		if (!this.screenGui) return;

		this.menuButton = new Instance("TextButton");
		this.menuButton.Name = "MenuButton";
		this.menuButton.AnchorPoint = new Vector2(1, 0);
		this.menuButton.Position = new UDim2(1, -MENU_CONFIG.BUTTON_OFFSET, 0, MENU_CONFIG.BUTTON_OFFSET);
		this.menuButton.Size = new UDim2(0, MENU_CONFIG.BUTTON_SIZE, 0, MENU_CONFIG.BUTTON_SIZE);
		this.menuButton.BackgroundColor3 = new Color3(0.1, 0.1, 0.1);
		this.menuButton.BackgroundTransparency = 0.3;
		this.menuButton.BorderSizePixel = 0;
		this.menuButton.Font = Enum.Font.GothamBold;
		this.menuButton.TextSize = 24;
		this.menuButton.TextColor3 = new Color3(1, 1, 1);
		this.menuButton.Text = MENU_CONFIG.BUTTON_ICON;
		this.menuButton.Parent = this.screenGui;

		// Add corner rounding
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0, 8);
		corner.Parent = this.menuButton;

		// Add hover effect
		this.menuButton.MouseEnter.Connect(() => {
			TweenService.Create(
				this.menuButton!,
				new TweenInfo(0.15, Enum.EasingStyle.Quad),
				{ BackgroundTransparency: 0.1 },
			).Play();
		});

		this.menuButton.MouseLeave.Connect(() => {
			TweenService.Create(
				this.menuButton!,
				new TweenInfo(0.15, Enum.EasingStyle.Quad),
				{ BackgroundTransparency: 0.3 },
			).Play();
		});

		// Click handler
		this.menuButton.MouseButton1Click.Connect(() => {
			this.toggleOverlay();
		});
	}

	private createOverlay(): void {
		if (!this.screenGui) return;

		// Create dark overlay background
		this.overlay = new Instance("Frame");
		this.overlay.Name = "MenuOverlay";
		this.overlay.Size = UDim2.fromScale(1, 1);
		this.overlay.BackgroundColor3 = new Color3(0, 0, 0);
		this.overlay.BackgroundTransparency = 1; // Start hidden
		this.overlay.BorderSizePixel = 0;
		this.overlay.Visible = false;
		this.overlay.Parent = this.screenGui;

		// Create centered menu container
		const menuContainer = new Instance("Frame");
		menuContainer.Name = "MenuContainer";
		menuContainer.AnchorPoint = new Vector2(0.5, 0.5);
		menuContainer.Position = UDim2.fromScale(0.5, 0.5);
		menuContainer.Size = new UDim2(0, MENU_CONFIG.MENU_BUTTON_WIDTH + MENU_CONFIG.BUTTON_PADDING * 2, 0, 0);
		menuContainer.AutomaticSize = Enum.AutomaticSize.Y;
		menuContainer.BackgroundColor3 = new Color3(0.15, 0.15, 0.15);
		menuContainer.BackgroundTransparency = 0.1;
		menuContainer.BorderSizePixel = 0;
		menuContainer.Parent = this.overlay;

		// Add corner rounding to container
		const containerCorner = new Instance("UICorner");
		containerCorner.CornerRadius = new UDim(0, 12);
		containerCorner.Parent = menuContainer;

		// Add padding to container
		const containerPadding = new Instance("UIPadding");
		containerPadding.PaddingTop = new UDim(0, MENU_CONFIG.BUTTON_PADDING);
		containerPadding.PaddingBottom = new UDim(0, MENU_CONFIG.BUTTON_PADDING);
		containerPadding.PaddingLeft = new UDim(0, MENU_CONFIG.BUTTON_PADDING);
		containerPadding.PaddingRight = new UDim(0, MENU_CONFIG.BUTTON_PADDING);
		containerPadding.Parent = menuContainer;

		// Add layout
		const layout = new Instance("UIListLayout");
		layout.FillDirection = Enum.FillDirection.Vertical;
		layout.HorizontalAlignment = Enum.HorizontalAlignment.Center;
		layout.VerticalAlignment = Enum.VerticalAlignment.Top;
		layout.Padding = new UDim(0, MENU_CONFIG.MENU_BUTTON_SPACING);
		layout.Parent = menuContainer;

		// Return to Lobby button
		const returnToLobbyButton = this.createMenuOptionButton("Return to Lobby", new Color3(0.8, 0.3, 0.3));
		returnToLobbyButton.Parent = menuContainer;
		returnToLobbyButton.MouseButton1Click.Connect(() => {
			this.onReturnToLobbyClicked();
		});

		// Close button
		const closeButton = this.createMenuOptionButton("Close", new Color3(0.3, 0.3, 0.3));
		closeButton.Parent = menuContainer;
		closeButton.MouseButton1Click.Connect(() => {
			this.hideOverlay();
		});

		// Click on overlay background to close
		this.overlay.InputBegan.Connect((input) => {
			if (input.UserInputType === Enum.UserInputType.MouseButton1 ||
				input.UserInputType === Enum.UserInputType.Touch) {
				this.hideOverlay();
			}
		});
	}

	private createMenuOptionButton(text: string, color: Color3): TextButton {
		const button = new Instance("TextButton");
		button.Name = text.gsub(" ", "")[0] + "Button";
		button.Size = new UDim2(0, MENU_CONFIG.MENU_BUTTON_WIDTH, 0, MENU_CONFIG.MENU_BUTTON_HEIGHT);
		button.BackgroundColor3 = color;
		button.BackgroundTransparency = 0;
		button.BorderSizePixel = 0;
		button.Font = Enum.Font.GothamBold;
		button.TextSize = 18;
		button.TextColor3 = new Color3(1, 1, 1);
		button.Text = text;

		// Add corner rounding
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0, 8);
		corner.Parent = button;

		// Add hover effect
		const originalColor = color;
		const hoverColor = new Color3(
			math.clamp(originalColor.R + 0.1, 0, 1),
			math.clamp(originalColor.G + 0.1, 0, 1),
			math.clamp(originalColor.B + 0.1, 0, 1),
		);

		button.MouseEnter.Connect(() => {
			TweenService.Create(
				button,
				new TweenInfo(0.1, Enum.EasingStyle.Quad),
				{ BackgroundColor3: hoverColor },
			).Play();
		});

		button.MouseLeave.Connect(() => {
			TweenService.Create(
				button,
				new TweenInfo(0.1, Enum.EasingStyle.Quad),
				{ BackgroundColor3: originalColor },
			).Play();
		});

		return button;
	}

	private toggleOverlay(): void {
		if (this.isOverlayVisible) {
			this.hideOverlay();
		} else {
			this.showOverlay();
		}
	}

	private showOverlay(): void {
		if (!this.overlay || this.isOverlayVisible) return;

		this.isOverlayVisible = true;
		this.overlay.Visible = true;

		// Animate in
		TweenService.Create(
			this.overlay,
			new TweenInfo(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
			{ BackgroundTransparency: MENU_CONFIG.OVERLAY_TRANSPARENCY },
		).Play();
	}

	private hideOverlay(): void {
		if (!this.overlay || !this.isOverlayVisible) return;

		this.isOverlayVisible = false;

		// Animate out
		const tween = TweenService.Create(
			this.overlay,
			new TweenInfo(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ BackgroundTransparency: 1 },
		);

		tween.Completed.Connect(() => {
			if (this.overlay && !this.isOverlayVisible) {
				this.overlay.Visible = false;
			}
		});

		tween.Play();
	}

	private onReturnToLobbyClicked(): void {
		print(`${LOG_PREFIX} Return to Lobby clicked`);

		// Hide overlay
		this.hideOverlay();

		// Fire server event
		GameServerEvents.requestReturnToLobby.fire();
	}
}

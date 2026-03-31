import { Controller, OnStart } from "@flamework/core";
import { Players, RunService, Workspace } from "@rbxts/services";
import { MinimapConfig, MapBounds } from "shared/constants/MinimapConfig";
import { PART_NAMES, ATTRIBUTE_NAMES } from "shared/constants/PartNames";
import { SCREEN_GUI_NAMES } from "shared/constants/UINames";
import { rgb } from "shared/utilities/ColorUtils";

interface IndicatorInfo {
	frame: Frame;
	active: boolean;
}

@Controller()
export class MinimapController implements OnStart {
	private player = Players.LocalPlayer;
	private mapConfig?: MapBounds;

	// UI elements
	private screenGui?: ScreenGui;
	private indicatorsContainer?: Frame;

	// Indicator pool for reuse
	private indicatorPool: IndicatorInfo[] = [];

	onStart(): void {
		// Get map config from Workspace.Map.MapId attribute
		const mapFolder = Workspace.FindFirstChild(PART_NAMES.MAP);
		if (!mapFolder) {
			warn("[MinimapController] No Map folder found in Workspace");
			return;
		}

		const mapId = mapFolder.GetAttribute(ATTRIBUTE_NAMES.MAP_ID) as string | undefined;
		if (!mapId) {
			warn("[MinimapController] No MapId attribute on Workspace.Map - minimap disabled");
			return;
		}

		const mapConfig = MinimapConfig.MAP_BOUNDS[mapId];
		if (!mapConfig) {
			warn(`[MinimapController] No minimap config for MapId "${mapId}" - minimap disabled`);
			return;
		}

		this.mapConfig = mapConfig;
		this.createUI(mapConfig);

		// Update loop
		RunService.RenderStepped.Connect(() => this.updateMinimap());
	}

	private createUI(mapConfig: MapBounds): void {
		const playerGui = this.player.WaitForChild("PlayerGui") as PlayerGui;

		// Create ScreenGui
		const screenGui = new Instance("ScreenGui");
		screenGui.Name = SCREEN_GUI_NAMES.MINIMAP_GUI;
		screenGui.ResetOnSpawn = false;
		screenGui.IgnoreGuiInset = true;
		screenGui.Parent = playerGui;
		this.screenGui = screenGui;

		// Container frame on left side, vertically centered
		const container = new Instance("Frame");
		container.Name = "MinimapContainer";
		container.Size = new UDim2(0, MinimapConfig.UI.WIDTH, 0, MinimapConfig.UI.HEIGHT);
		container.Position = new UDim2(0, MinimapConfig.UI.LEFT_OFFSET, 0.5, 0);
		container.AnchorPoint = new Vector2(0, 0.5);
		container.BackgroundTransparency = 1;
		container.BorderSizePixel = 0;
		container.Parent = screenGui;

		// Corner rounding for container
		const containerCorner = new Instance("UICorner");
		containerCorner.CornerRadius = new UDim(0, MinimapConfig.UI.CORNER_RADIUS);
		containerCorner.Parent = container;

		// Background image (inside container with padding for border effect)
		const background = new Instance("ImageLabel");
		background.Name = "Background";
		background.Size = new UDim2(
			1,
			-MinimapConfig.UI.BORDER_THICKNESS * 2,
			1,
			-MinimapConfig.UI.BORDER_THICKNESS * 2,
		);
		background.Position = new UDim2(0, MinimapConfig.UI.BORDER_THICKNESS, 0, MinimapConfig.UI.BORDER_THICKNESS);
		background.BackgroundColor3 = new Color3(0.1, 0.1, 0.1);
		background.BackgroundTransparency = MinimapConfig.UI.BACKGROUND_TRANSPARENCY;
		background.BorderSizePixel = 0;
		background.ScaleType = Enum.ScaleType.Stretch;
		background.Parent = container;

		// Corner rounding for background
		const backgroundCorner = new Instance("UICorner");
		backgroundCorner.CornerRadius = new UDim(0, MinimapConfig.UI.CORNER_RADIUS - MinimapConfig.UI.BORDER_THICKNESS);
		backgroundCorner.Parent = background;

		// Set minimap image from asset ID
		background.Image = mapConfig.imageId;
		background.ImageTransparency = mapConfig.imageTransparency ?? 0;

		// Indicators container (overlays the background)
		const indicators = new Instance("Frame");
		indicators.Name = "Indicators";
		indicators.Size = new UDim2(1, 0, 1, 0);
		indicators.Position = new UDim2(0, 0, 0, 0);
		indicators.BackgroundTransparency = 1;
		indicators.Parent = background;
		this.indicatorsContainer = indicators;
	}

	private updateMinimap(): void {
		if (!this.mapConfig || !this.indicatorsContainer) return;

		const localUserId = this.player.UserId;
		const localBallName = `Ball_${localUserId}`;

		// Mark all indicators as inactive
		for (const indicator of this.indicatorPool) {
			indicator.active = false;
		}

		// Scan workspace for all Ball_* and Bot_* models
		let indicatorIndex = 0;
		for (const child of Workspace.GetChildren()) {
			const isBall = child.Name.sub(1, 5) === "Ball_";
			const isBot = child.Name.sub(1, 4) === "Bot_";
			if (child.IsA("Model") && (isBall || isBot)) {
				const sphere = child.FindFirstChild(PART_NAMES.SPHERE) as BasePart | undefined;
				if (sphere) {
					const isLocalPlayer = child.Name === localBallName;
					const worldPos = sphere.Position;
					const minimapPos = this.worldToMinimap(worldPos, this.mapConfig);

					// Get or create indicator
					const indicator = this.getOrCreateIndicator(indicatorIndex, isLocalPlayer);
					indicator.active = true;

					// Update position (centered on the indicator)
					const indicatorSize = isLocalPlayer
						? MinimapConfig.LOCAL_PLAYER.SIZE
						: MinimapConfig.OTHER_RACER.SIZE;
					indicator.frame.Position = new UDim2(minimapPos.X, -indicatorSize / 2, minimapPos.Y, -indicatorSize / 2);
					indicator.frame.Size = new UDim2(0, indicatorSize, 0, indicatorSize);

					// Update color
					const colorConfig = isLocalPlayer ? MinimapConfig.LOCAL_PLAYER : MinimapConfig.OTHER_RACER;
					indicator.frame.BackgroundColor3 = rgb(colorConfig.COLOR.r, colorConfig.COLOR.g, colorConfig.COLOR.b);

					// Update ZIndex (local player on top)
					indicator.frame.ZIndex = isLocalPlayer ? 10 : 1;

					indicatorIndex++;
				}
			}
		}

		// Hide unused indicators
		for (const indicator of this.indicatorPool) {
			indicator.frame.Visible = indicator.active;
		}
	}

	private worldToMinimap(worldPos: Vector3, config: MapBounds): Vector2 {
		// World X → Minimap X (0 to 1)
		let minimapX = (worldPos.X - config.minX) / (config.maxX - config.minX);
		if (config.invertX) minimapX = 1 - minimapX;

		// World Z → Minimap Y (0 to 1)
		let minimapY = (worldPos.Z - config.minZ) / (config.maxZ - config.minZ);
		if (config.invertZ) minimapY = 1 - minimapY;

		// Clamp to bounds
		return new Vector2(math.clamp(minimapX, 0, 1), math.clamp(minimapY, 0, 1));
	}

	private getOrCreateIndicator(index: number, isLocalPlayer: boolean): IndicatorInfo {
		// Return existing indicator if available
		if (index < this.indicatorPool.size()) {
			return this.indicatorPool[index];
		}

		// Create new indicator
		const frame = new Instance("Frame");
		frame.Name = `Indicator_${index}`;
		frame.BackgroundColor3 = new Color3(1, 1, 1);
		frame.BorderSizePixel = 0;
		frame.Parent = this.indicatorsContainer;

		// Make it circular
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(MinimapConfig.INDICATOR.CORNER_RADIUS, 0);
		corner.Parent = frame;

		// Add border stroke
		const stroke = new Instance("UIStroke");
		stroke.Thickness = MinimapConfig.INDICATOR.BORDER_THICKNESS;
		stroke.Color = rgb(
			MinimapConfig.INDICATOR.BORDER_COLOR.r,
			MinimapConfig.INDICATOR.BORDER_COLOR.g,
			MinimapConfig.INDICATOR.BORDER_COLOR.b,
		);
		stroke.Parent = frame;

		const indicatorInfo: IndicatorInfo = {
			frame,
			active: false,
		};
		this.indicatorPool.push(indicatorInfo);

		return indicatorInfo;
	}
}

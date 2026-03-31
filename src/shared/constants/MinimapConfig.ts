/**
 * Minimap configuration for displaying player/bot positions on a top-down map view.
 * Extensible per-map with different bounds and images.
 */

/**
 * Per-map bounds configuration.
 * Coordinates are world space (X = horizontal, Z = vertical on minimap).
 */
export interface MapBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	imageId: string; // Roblox asset ID (e.g., "rbxassetid://123456")
	// Optional per-map overrides
	invertX?: boolean; // Flip X axis (default: false)
	invertZ?: boolean; // Flip Z axis (default: false)
	imageTransparency?: number; // 0 = opaque, 1 = invisible (default: 0)
}

export const MinimapConfig = {
	// Per-map bounds (keyed by MapId attribute value)
	MAP_BOUNDS: {
		Spaceloop: {
			minX: -700,
			maxX: 800,
			minZ: -1050,
			maxZ: 1100,
			imageId: "rbxassetid://101750654026541",
		},
	} as Record<string, MapBounds>,

	// UI layout
	UI: {
		WIDTH: 200,
		HEIGHT: 275,
		LEFT_OFFSET: 16,
		BACKGROUND_TRANSPARENCY: 1,
		CORNER_RADIUS: 8,
		BORDER_COLOR: { r: 60, g: 60, b: 60 },
		BORDER_THICKNESS: 0,
	},

	// Local player indicator
	LOCAL_PLAYER: {
		COLOR: { r: 50, g: 150, b: 255 }, // Blue
		SIZE: 12,
	},

	// Other racers (players and bots)
	OTHER_RACER: {
		COLOR: { r: 255, g: 255, b: 255 }, // White
		SIZE: 8,
	},

	// Indicator styling
	INDICATOR: {
		CORNER_RADIUS: 0.5, // Makes it circular (UDim scale)
		BORDER_THICKNESS: 1,
		BORDER_COLOR: { r: 0, g: 0, b: 0 },
	},
} as const;

// Type for map IDs
export type MapId = keyof typeof MinimapConfig.MAP_BOUNDS;

/**
 * Color utility functions for working with RGB values.
 */

/**
 * RGB tuple type (values 0-255).
 */
export type RGBTuple = readonly [number, number, number];

/**
 * Converts an RGB tuple (0-255 range) to a Color3 (0-1 range).
 * @param rgb RGB tuple with values from 0 to 255
 * @returns Color3 instance
 */
export function rgbToColor3(rgb: RGBTuple): Color3 {
	return new Color3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

/**
 * Converts a Color3 (0-1 range) to an RGB tuple (0-255 range).
 * @param color Color3 instance
 * @returns RGB tuple with values from 0 to 255
 */
export function color3ToRgb(color: Color3): RGBTuple {
	return [math.floor(color.R * 255), math.floor(color.G * 255), math.floor(color.B * 255)] as const;
}

/**
 * Linearly interpolates between two RGB tuples.
 * @param colorA Start color (RGB 0-255)
 * @param colorB End color (RGB 0-255)
 * @param t Interpolation factor (0-1)
 * @returns Interpolated Color3
 */
export function lerpRgb(colorA: RGBTuple, colorB: RGBTuple, t: number): Color3 {
	const clampedT = math.clamp(t, 0, 1);
	return new Color3(
		(colorA[0] + (colorB[0] - colorA[0]) * clampedT) / 255,
		(colorA[1] + (colorB[1] - colorA[1]) * clampedT) / 255,
		(colorA[2] + (colorB[2] - colorA[2]) * clampedT) / 255,
	);
}

/**
 * Creates a Color3 from individual RGB values (0-255 range).
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 * @returns Color3 instance
 */
export function rgb(r: number, g: number, b: number): Color3 {
	return new Color3(r / 255, g / 255, b / 255);
}

import { OnStart, Service } from "@flamework/core";
import { CollectionService } from "@rbxts/services";
import { TAGS } from "shared/globals";
import { ATTRIBUTE_NAMES } from "shared/constants/PartNames";
import { BotConfig } from "shared/constants/BotConfig";
import { BotWaypoint, BotAvoidZone, BotState } from "shared/types/BotTypes";

const LOG_PREFIX = "[BotNavigationService]";

@Service()
export class BotNavigationService implements OnStart {
	private waypoints: BotWaypoint[] = [];
	private avoidZones: BotAvoidZone[] = [];

	onStart(): void {
		print(`${LOG_PREFIX} Started`);
		this.loadWaypoints();
		this.loadAvoidZones();
	}

	private parseWaypointNumber(name: string): number | undefined {
		// Extract number from end of name (e.g., "Waypoint1" -> 1, "WP5" -> 5)
		const match = name.match("(%d+)$");
		if (match && match[0]) {
			return tonumber(match[0]);
		}
		return undefined;
	}

	private loadWaypoints(): void {
		const waypointFolders = CollectionService.GetTagged(TAGS.BOT_WAYPOINTS);

		if (waypointFolders.size() === 0) {
			print(`${LOG_PREFIX} No BotWaypoints folder found. Tag a folder with 'BotWaypoints'.`);
			return;
		}

		const waypointsFolder = waypointFolders[0] as Folder;
		print(`${LOG_PREFIX} Found waypoints folder: ${waypointsFolder.GetFullName()}`);

		this.waypoints = [];

		for (const child of waypointsFolder.GetChildren()) {
			if (!child.IsA("BasePart")) continue;

			const order = this.parseWaypointNumber(child.Name);
			if (order === undefined) {
				warn(`${LOG_PREFIX} Could not parse waypoint number from "${child.Name}", skipping`);
				continue;
			}

			const isJumpZone = (child.GetAttribute(ATTRIBUTE_NAMES.JUMP_ZONE) as boolean | undefined) ?? false;
			const radius =
				(child.GetAttribute(ATTRIBUTE_NAMES.WAYPOINT_RADIUS) as number | undefined) ??
				BotConfig.WAYPOINT_CAPTURE_RADIUS;

			this.waypoints.push({
				position: child.Position,
				order: order,
				radius: radius,
				isJumpZone: isJumpZone,
			});
		}

		// Sort by order
		this.waypoints.sort((a, b) => a.order < b.order);

		print(`${LOG_PREFIX} Loaded ${this.waypoints.size()} waypoints`);
	}

	private loadAvoidZones(): void {
		const avoidFolders = CollectionService.GetTagged(TAGS.BOT_AVOID_WAYPOINTS);

		if (avoidFolders.size() === 0) {
			print(`${LOG_PREFIX} No BotAvoidWaypoints folder found (optional)`);
			return;
		}

		const avoidFolder = avoidFolders[0] as Folder;
		print(`${LOG_PREFIX} Found avoid waypoints folder: ${avoidFolder.GetFullName()}`);

		this.avoidZones = [];

		for (const child of avoidFolder.GetChildren()) {
			if (!child.IsA("BasePart")) continue;

			const radius =
				(child.GetAttribute(ATTRIBUTE_NAMES.AVOID_RADIUS) as number | undefined) ?? BotConfig.AVOID_DEFAULT_RADIUS;
			const strength =
				(child.GetAttribute(ATTRIBUTE_NAMES.AVOID_STRENGTH) as number | undefined) ??
				BotConfig.AVOID_DEFAULT_STRENGTH;

			this.avoidZones.push({
				position: child.Position,
				radius: radius,
				strength: strength,
			});
		}

		print(`${LOG_PREFIX} Loaded ${this.avoidZones.size()} avoid zones`);
	}

	public getWaypoints(): BotWaypoint[] {
		return this.waypoints;
	}

	public getAvoidZones(): BotAvoidZone[] {
		return this.avoidZones;
	}

	public getWaypointCount(): number {
		return this.waypoints.size();
	}

	/**
	 * Get steering direction combining seek toward waypoint and avoidance forces.
	 */
	public getSteeringDirection(
		currentPos: Vector3,
		currentVelocity: Vector3,
		targetWaypoint: BotWaypoint | undefined,
	): Vector3 {
		if (!targetWaypoint) {
			return Vector3.zero;
		}

		// Seek direction (toward waypoint, XZ plane only)
		const toTarget = targetWaypoint.position.sub(currentPos);
		let seekDir = new Vector3(toTarget.X, 0, toTarget.Z);
		if (seekDir.Magnitude > 0.001) {
			seekDir = seekDir.Unit;
		} else {
			seekDir = Vector3.zero;
		}

		// Accumulate avoidance forces
		let avoidForce = Vector3.zero;
		for (const zone of this.avoidZones) {
			const toZone = currentPos.sub(zone.position);
			const distance = toZone.Magnitude;

			if (distance < zone.radius && distance > 0.001) {
				// Calculate avoidance strength with falloff
				const normalizedDist = distance / zone.radius;
				const falloff = math.pow(1 - normalizedDist, BotConfig.AVOID_FALLOFF_EXPONENT);
				const strength = zone.strength * falloff;

				// Direction away from zone (XZ plane)
				const awayDir = new Vector3(toZone.X, 0, toZone.Z).Unit;
				avoidForce = avoidForce.add(awayDir.mul(strength));
			}
		}

		// Combine seek and avoidance
		let combined = seekDir.add(avoidForce.mul(BotConfig.AVOID_FORCE_MULTIPLIER));

		// Normalize result
		if (combined.Magnitude > 0.001) {
			combined = combined.Unit;
		} else {
			combined = seekDir;
		}

		return combined;
	}

	/**
	 * Select the best waypoint to target using lookahead.
	 * Considers forwardness (dot product with velocity) and distance.
	 */
	public selectBestWaypoint(botState: BotState): BotWaypoint | undefined {
		if (this.waypoints.size() === 0) return undefined;

		const currentPos = botState.sphere.Position;
		const currentVelocity = botState.sphere.AssemblyLinearVelocity;
		const velocityDir =
			currentVelocity.Magnitude > 1 ? new Vector3(currentVelocity.X, 0, currentVelocity.Z).Unit : Vector3.zero;

		let bestWaypoint: BotWaypoint | undefined = undefined;
		let bestScore = -math.huge;

		// Look at current and next few waypoints
		const startIndex = botState.currentWaypointIndex;
		const endIndex = math.min(startIndex + BotConfig.WAYPOINT_LOOKAHEAD, this.waypoints.size() - 1);

		for (let i = startIndex; i <= endIndex; i++) {
			const waypoint = this.waypoints[i];
			const toWaypoint = waypoint.position.sub(currentPos);
			const distance = toWaypoint.Magnitude;

			// Skip if very close (already past it)
			if (distance < 2) continue;

			// Calculate forwardness score
			let forwardness = 0;
			if (velocityDir.Magnitude > 0.5) {
				const waypointDir = new Vector3(toWaypoint.X, 0, toWaypoint.Z).Unit;
				forwardness = velocityDir.Dot(waypointDir);
			}

			// Score: prioritize forwardness, penalize distance
			// Waypoints ahead are better, closer waypoints are slightly better
			const distanceScore = math.max(0, 1 - distance / 200); // Falls off over 200 studs
			const score = forwardness * 2 + distanceScore + (i - startIndex) * 0.1; // Small bonus for progression

			if (score > bestScore) {
				bestScore = score;
				bestWaypoint = waypoint;
			}
		}

		// If no good waypoint found, just use current index
		if (!bestWaypoint && this.waypoints.size() > 0) {
			const clampedIndex = math.clamp(botState.currentWaypointIndex, 0, this.waypoints.size() - 1);
			bestWaypoint = this.waypoints[clampedIndex];
		}

		return bestWaypoint;
	}

	/**
	 * Check if bot has reached current waypoint.
	 */
	public checkWaypointReached(botState: BotState): boolean {
		if (!botState.targetWaypoint) return false;

		const distance = botState.sphere.Position.sub(botState.targetWaypoint.position).Magnitude;
		return distance < botState.targetWaypoint.radius;
	}

	/**
	 * Advance to next waypoint (wraps around).
	 */
	public advanceToNextWaypoint(botState: BotState): void {
		if (this.waypoints.size() === 0) return;

		botState.currentWaypointIndex = (botState.currentWaypointIndex + 1) % this.waypoints.size();
		botState.targetWaypoint = this.waypoints[botState.currentWaypointIndex];
	}

	/**
	 * Check if bot should jump based on approaching a jump zone waypoint.
	 */
	public shouldJump(botState: BotState): boolean {
		if (!botState.targetWaypoint || !botState.targetWaypoint.isJumpZone) {
			return false;
		}

		const distance = botState.sphere.Position.sub(botState.targetWaypoint.position).Magnitude;
		return distance < BotConfig.JUMP_ANTICIPATION_DISTANCE && botState.isGrounded;
	}

	/**
	 * Find the closest waypoint to a position and update the bot's target.
	 * Used after respawning to re-orient the bot.
	 */
	public setClosestWaypoint(botState: BotState): void {
		if (this.waypoints.size() === 0) return;

		const currentPos = botState.sphere.Position;
		let closestIndex = 0;
		let closestDistance = math.huge;

		for (let i = 0; i < this.waypoints.size(); i++) {
			const waypoint = this.waypoints[i];
			const distance = currentPos.sub(waypoint.position).Magnitude;

			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = i;
			}
		}

		botState.currentWaypointIndex = closestIndex;
		botState.targetWaypoint = this.waypoints[closestIndex];
	}
}

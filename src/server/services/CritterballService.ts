import { OnStart, Service } from "@flamework/core";
import { Players, ReplicatedStorage, Workspace } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { ServerEvents } from "server/network";

@Service()
export class CritterballService implements OnStart {
	private ballsFolder = ReplicatedStorage.WaitForChild("Balls") as Folder;
	private trailsFolder = ReplicatedStorage.WaitForChild("Trails") as Folder;

	onStart(): void {
		print("Critterball Server Started!");

		// Validate templates on startup
		this.validateBallTemplate(BallConfig.DEFAULT_BALL);
		this.validateTrailTemplate(BallConfig.DEFAULT_TRAIL);

		// Handle player joining
		Players.PlayerAdded.Connect((player) => this.onPlayerAdded(player));

		// Handle existing players (for studio testing)
		for (const player of Players.GetPlayers()) {
			this.onPlayerAdded(player);
		}

		// Handle ball request from client
		ServerEvents.requestEnterBall.connect((player) => {
			this.spawnBallForPlayer(player);
		});
	}

	// ==================== VALIDATION ====================

	private validateBallTemplate(ballName: string): boolean {
		const ballTemplate = this.ballsFolder.FindFirstChild(ballName);

		if (!ballTemplate) {
			warn(`[BallModel Error] Ball template not found: "${ballName}"`);
			warn(`  Expected location: ReplicatedStorage/Balls/${ballName}`);
			return false;
		}

		if (!ballTemplate.IsA("Model")) {
			warn(`[BallModel Error] Ball template "${ballName}" must be a Model, got ${ballTemplate.ClassName}`);
			warn(`  Expected: Model`);
			return false;
		}

		const sphere = ballTemplate.FindFirstChild("Sphere");
		if (!sphere) {
			warn(`[BallModel Error] Ball template "${ballName}" missing required child: "Sphere"`);
			warn(`  Expected structure:`);
			warn(`    ${ballName}/ (Model)`);
			warn(`      Sphere (Part - the main physics ball)`);
			return false;
		}

		if (!sphere.IsA("BasePart")) {
			warn(`[BallModel Error] "Sphere" in "${ballName}" must be a BasePart, got ${sphere.ClassName}`);
			return false;
		}

		print(`[BallModel] Validated ball template: ${ballName}`);
		return true;
	}

	private validateTrailTemplate(trailName: string): boolean {
		const trailTemplate = this.trailsFolder.FindFirstChild(trailName);

		if (!trailTemplate) {
			warn(`[Trail Error] Trail template not found: "${trailName}"`);
			warn(`  Expected location: ReplicatedStorage/Trails/${trailName}`);
			return false;
		}

		if (!trailTemplate.IsA("Folder")) {
			warn(`[Trail Error] Trail template "${trailName}" must be a Folder, got ${trailTemplate.ClassName}`);
			return false;
		}

		// Check for attachments
		const attachments: Attachment[] = [];
		const trails: Trail[] = [];

		for (const child of trailTemplate.GetChildren()) {
			if (child.IsA("Attachment")) {
				attachments.push(child);
			} else if (child.IsA("Trail")) {
				trails.push(child);
			} else {
				warn(`[Trail Warning] Unexpected child in "${trailName}": ${child.Name} (${child.ClassName})`);
			}
		}

		if (attachments.size() < 2) {
			warn(`[Trail Error] Trail template "${trailName}" needs at least 2 Attachments, found ${attachments.size()}`);
			warn(`  Expected structure:`);
			warn(`    ${trailName}/ (Folder)`);
			warn(`      TopAttachment (Attachment)`);
			warn(`      BottomAttachment (Attachment)`);
			warn(`      Trail (Trail)`);
			return false;
		}

		if (trails.size() === 0) {
			warn(`[Trail Error] Trail template "${trailName}" needs at least 1 Trail instance, found 0`);
			warn(`  Expected structure:`);
			warn(`    ${trailName}/ (Folder)`);
			warn(`      TopAttachment (Attachment)`);
			warn(`      BottomAttachment (Attachment)`);
			warn(`      Trail (Trail)`);
			return false;
		}

		// Check trail attachments are linked
		for (const trail of trails) {
			if (!trail.Attachment0) {
				warn(`[Trail Error] Trail "${trail.Name}" in "${trailName}" has no Attachment0 set`);
				return false;
			}
			if (!trail.Attachment1) {
				warn(`[Trail Error] Trail "${trail.Name}" in "${trailName}" has no Attachment1 set`);
				return false;
			}
		}

		print(`[Trail] Validated trail template: ${trailName} (${attachments.size()} attachments, ${trails.size()} trails)`);
		return true;
	}

	// ==================== PLAYER HANDLING ====================

	private onPlayerAdded(player: Player): void {
		player.CharacterAdded.Connect((character) => {
			this.onCharacterAdded(player, character);
		});

		// Handle existing character
		if (player.Character) {
			this.onCharacterAdded(player, player.Character);
		}
	}

	private onCharacterAdded(player: Player, character: Model): void {
		// Wait for humanoid to load
		const humanoid = character.WaitForChild("Humanoid") as Humanoid;
		humanoid.WaitForChild("Animator");
		character.WaitForChild("HumanoidRootPart");

		// Small delay to ensure everything is ready
		task.wait(0.1);

		// Auto-spawn ball for player
		this.spawnBallForPlayer(player);
	}

	// ==================== BALL SPAWNING ====================

	private spawnBallForPlayer(player: Player): void {
		const character = player.Character;
		if (!character) return;

		const humanoidRootPart = character.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		const humanoid = character.FindFirstChild("Humanoid") as Humanoid | undefined;
		if (!humanoidRootPart || !humanoid) return;

		// Check if player already has a ball
		const existingBall = Workspace.FindFirstChild(`Ball_${player.UserId}`);
		if (existingBall) {
			existingBall.Destroy();
		}

		// Get and validate ball template
		const ballTemplate = this.ballsFolder.FindFirstChild(BallConfig.DEFAULT_BALL) as Model | undefined;
		if (!ballTemplate || !ballTemplate.IsA("Model")) {
			warn(`[BallModel Error] Cannot spawn ball - template "${BallConfig.DEFAULT_BALL}" not found or invalid`);
			return;
		}

		// Clone ball model
		const ball = ballTemplate.Clone();
		ball.Name = `Ball_${player.UserId}`;

		// Find the sphere part
		const sphere = ball.FindFirstChild("Sphere") as BasePart | undefined;
		if (!sphere) {
			warn(`[BallModel Error] Cannot spawn ball - "Sphere" part missing from template`);
			ball.Destroy();
			return;
		}

		// Position ball at character location
		const spawnPosition = humanoidRootPart.Position.add(new Vector3(0, 3, 0));
		ball.PivotTo(new CFrame(spawnPosition));

		// Set physics properties
		sphere.CustomPhysicalProperties = new PhysicalProperties(
			1, // density
			BallConfig.BALL_FRICTION,
			BallConfig.BALL_ELASTICITY,
			1, // frictionWeight
			1, // elasticityWeight
		);

		// Parent ball to workspace
		ball.Parent = Workspace;

		// Add reduced gravity (VectorForce to counteract some gravity)
		this.applyReducedGravity(sphere);

		// Attach character to ball
		this.attachCharacterToBall(character, humanoidRootPart, humanoid, sphere);

		// Create trail system
		this.createTrailForBall(player, ball, sphere, BallConfig.DEFAULT_TRAIL);

		// Set network ownership to the player (must be done after parenting)
		sphere.SetNetworkOwner(player);

		// Notify client that ball is ready
		ServerEvents.ballReady.fire(player, ball);

		print(`Ball spawned for player: ${player.Name}`);
	}

	// ==================== CHARACTER ATTACHMENT ====================

	private attachCharacterToBall(
		character: Model,
		humanoidRootPart: BasePart,
		humanoid: Humanoid,
		sphere: BasePart,
	): void {
		// Make all character parts massless so only ball mass matters
		this.setCharacterMassless(character, true);

		// Create attachment at ball center
		const ballAttachment = new Instance("Attachment");
		ballAttachment.Name = "BallAttachment";
		ballAttachment.Parent = sphere;

		// Create attachment on HumanoidRootPart
		const charAttachment = new Instance("Attachment");
		charAttachment.Name = "CharacterAttachment";
		charAttachment.Parent = humanoidRootPart;

		// Connect with RigidConstraint
		const constraint = new Instance("RigidConstraint");
		constraint.Name = "BallConstraint";
		constraint.Attachment0 = ballAttachment;
		constraint.Attachment1 = charAttachment;
		constraint.Parent = sphere;

		// Disable normal walking
		humanoid.PlatformStand = true;

		// Disable the Animate script if it exists
		const animate = character.FindFirstChild("Animate");
		if (animate && animate.IsA("LocalScript")) {
			animate.Enabled = false;
		}
	}

	private setCharacterMassless(character: Model, massless: boolean): void {
		for (const part of character.GetDescendants()) {
			if (part.IsA("BasePart")) {
				part.Massless = massless;
			}
		}
	}

	// ==================== PHYSICS ====================

	private applyReducedGravity(sphere: BasePart): void {
		// Create attachment for the VectorForce
		const attachment = new Instance("Attachment");
		attachment.Name = "GravityAttachment";
		attachment.Parent = sphere;

		// Calculate upward force to counteract some gravity
		// Force = mass * gravity * (1 - multiplier)
		const mass = sphere.AssemblyMass;
		const gravityReduction = 1 - BallConfig.GRAVITY_MULTIPLIER;
		const upwardForce = mass * Workspace.Gravity * gravityReduction;

		// Create VectorForce
		const vectorForce = new Instance("VectorForce");
		vectorForce.Name = "GravityReduction";
		vectorForce.Attachment0 = attachment;
		vectorForce.Force = new Vector3(0, upwardForce, 0);
		vectorForce.RelativeTo = Enum.ActuatorRelativeTo.World;
		vectorForce.ApplyAtCenterOfMass = true;
		vectorForce.Parent = sphere;
	}

	// ==================== TRAIL SYSTEM ====================

	private createTrailForBall(player: Player, ball: Model, sphere: BasePart, trailName: string): void {
		// Get and validate trail template
		const trailTemplate = this.trailsFolder.FindFirstChild(trailName) as Folder | undefined;
		if (!trailTemplate || !trailTemplate.IsA("Folder")) {
			warn(`[Trail Error] Cannot create trail - template "${trailName}" not found or invalid`);
			return;
		}

		// Create invisible anchor part that follows the ball but doesn't rotate
		const trailAnchor = new Instance("Part");
		trailAnchor.Name = "TrailAnchor";
		trailAnchor.Size = new Vector3(1, 1, 1);
		trailAnchor.Transparency = 1;
		trailAnchor.CanCollide = false;
		trailAnchor.CanQuery = false;
		trailAnchor.CanTouch = false;
		trailAnchor.Massless = true;
		trailAnchor.Anchored = false;
		trailAnchor.CFrame = sphere.CFrame;
		trailAnchor.Parent = ball;

		// Create attachment on sphere for AlignPosition
		const sphereAttachment = new Instance("Attachment");
		sphereAttachment.Name = "TrailFollowAttachment";
		sphereAttachment.Parent = sphere;

		// Create attachment on trail anchor
		const anchorAttachment = new Instance("Attachment");
		anchorAttachment.Name = "TrailAnchorAttachment";
		anchorAttachment.Parent = trailAnchor;

		// AlignPosition to follow the ball
		const alignPosition = new Instance("AlignPosition");
		alignPosition.Name = "TrailAlignPosition";
		alignPosition.Attachment0 = anchorAttachment;
		alignPosition.Attachment1 = sphereAttachment;
		alignPosition.MaxForce = 1000000;
		alignPosition.MaxVelocity = math.huge;
		alignPosition.Responsiveness = 200;
		alignPosition.Parent = trailAnchor;

		// AlignOrientation to stay upright (world space)
		const alignOrientation = new Instance("AlignOrientation");
		alignOrientation.Name = "TrailAlignOrientation";
		alignOrientation.Attachment0 = anchorAttachment;
		alignOrientation.Mode = Enum.OrientationAlignmentMode.OneAttachment;
		alignOrientation.CFrame = new CFrame(); // World upright
		alignOrientation.MaxTorque = 1000000;
		alignOrientation.Responsiveness = 200;
		alignOrientation.Parent = trailAnchor;

		// Set network ownership to the player
		trailAnchor.SetNetworkOwner(player);

		// Clone trail template contents onto the anchor
		this.applyTrailTemplate(trailAnchor, trailTemplate);

		print(`Trail created: ${trailName}`);
	}

	private applyTrailTemplate(trailAnchor: Part, trailTemplate: Folder): void {
		// Remove existing trail components
		for (const child of trailAnchor.GetChildren()) {
			if (child.IsA("Trail") || (child.IsA("Attachment") && child.Name !== "TrailAnchorAttachment")) {
				child.Destroy();
			}
		}

		// Clone attachments and trails from template
		const attachmentMap = new Map<string, Attachment>();

		// First pass: clone attachments
		for (const child of trailTemplate.GetChildren()) {
			if (child.IsA("Attachment")) {
				const attachment = child.Clone();
				attachment.Parent = trailAnchor;
				attachmentMap.set(child.Name, attachment);
			}
		}

		// Second pass: clone trails and link attachments
		for (const child of trailTemplate.GetChildren()) {
			if (child.IsA("Trail")) {
				const trail = child.Clone();

				// Relink attachments to the cloned ones
				const originalAttachment0 = child.Attachment0;
				const originalAttachment1 = child.Attachment1;

				if (originalAttachment0) {
					trail.Attachment0 = attachmentMap.get(originalAttachment0.Name);
				}
				if (originalAttachment1) {
					trail.Attachment1 = attachmentMap.get(originalAttachment1.Name);
				}

				trail.Parent = trailAnchor;
			}
		}
	}
}

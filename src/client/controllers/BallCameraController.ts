import { Controller, OnStart } from "@flamework/core";
import { Players, Workspace } from "@rbxts/services";
import { ClientEvents } from "client/network";
import { BallConfig } from "shared/constants/BallConfig";

@Controller()
export class BallCameraController implements OnStart {
	private camera = Workspace.CurrentCamera;
	private player = Players.LocalPlayer;

	onStart(): void {
		// Listen for ball ready event to set camera subject
		ClientEvents.ballReady.connect((ball) => {
			this.onBallReady(ball);
		});
	}

	private onBallReady(ball: Model): void {
		const sphere = ball.FindFirstChild("Sphere") as BasePart;
		if (!sphere) return;

		// Set camera subject to the sphere
		// This lets the default Roblox camera system handle orbiting
		if (this.camera) {
			this.camera.CameraSubject = sphere;
			this.camera.CameraType = Enum.CameraType.Custom;
		}

		// Set zoom limits on the player
		this.player.CameraMinZoomDistance = BallConfig.CAMERA_MIN_ZOOM;
		this.player.CameraMaxZoomDistance = BallConfig.CAMERA_MAX_ZOOM;

		print("Camera following ball");
	}
}

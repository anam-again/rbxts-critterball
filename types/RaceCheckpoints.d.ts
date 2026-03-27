// Checkpoint part with CheckpointNumber attribute (0, 1, 2, ...)
// Contains SpawnPoint children underneath
type Checkpoint = Part & {
	// CheckpointNumber attribute defines the order (0 = start/finish)
	// SpawnPoint1, SpawnPoint2, etc. children for spawn positions
};

// Folder tagged with RaceCheckpoints containing Checkpoint children
type RaceCheckpointsFolder = Folder & {
	// Contains Checkpoint children
};

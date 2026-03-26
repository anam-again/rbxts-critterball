const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PLACES } = require("./config");

const target = process.argv[2]; // "lobby", "testing", or "all"

function build(name) {
	const place = PLACES[name];
	if (!place) {
		console.error(`Unknown place: ${name}`);
		process.exit(1);
	}

	// Ensure build directory exists
	const buildDir = path.dirname(place.output);
	fs.mkdirSync(buildDir, { recursive: true });

	console.log(`\nBuilding ${name}...`);
	execSync(`rojo build ${place.project} -o ${place.output}`, {
		stdio: "inherit",
		shell: true,
	});
	console.log(`${name} built: ${place.output}`);
}

// Compile TypeScript first
console.log("Compiling TypeScript...");
execSync("rbxtsc --rojo build.project.json", { stdio: "inherit", shell: true });

if (target === "all") {
	build("lobby");
	build("testing");
} else if (target) {
	build(target);
} else {
	console.error("Usage: node scripts/build-rbxl.js <lobby|testing|all>");
	process.exit(1);
}

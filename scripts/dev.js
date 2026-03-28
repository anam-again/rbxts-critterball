const { spawn } = require("child_process");
const { PLACES } = require("./config");

const target = process.argv[2]; // "lobby" or "spaceloop"

if (!target || !PLACES[target]) {
	console.error("Usage: node scripts/dev.js <lobby|spaceloop>");
	console.error("Available places:", Object.keys(PLACES).join(", "));
	process.exit(1);
}

const place = PLACES[target];

console.log(`Starting development server for ${target}...`);
console.log(`  TypeScript: watching`);
console.log(`  Rojo: serving ${place.project}\n`);

// Start TypeScript compiler in watch mode
const tsc = spawn("rbxtsc", ["-w", "--rojo", "build.project.json"], {
	stdio: "inherit",
	shell: true,
});

// Start Rojo server
const rojo = spawn("rojo", ["serve", place.project], {
	stdio: "inherit",
	shell: true,
});

// Handle cleanup
process.on("SIGINT", () => {
	tsc.kill();
	rojo.kill();
	process.exit(0);
});

process.on("SIGTERM", () => {
	tsc.kill();
	rojo.kill();
	process.exit(0);
});

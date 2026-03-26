const { execSync } = require("child_process");
require("dotenv").config();
const { UNIVERSE_ID, PLACES } = require("./config");

const target = process.argv[2]; // "lobby", "testing", or "all"

// Prefer API key (Open Cloud) over cookie
const useApiKey = !!process.env.UNIVERSE_PUSH_API_KEY;
const useCookie = !useApiKey && !!process.env.ROBLOSECURITY;

if (!useApiKey && !useCookie) {
	console.error("Error: Neither UNIVERSE_PUSH_API_KEY nor ROBLOSECURITY found in .env file");
	process.exit(1);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deploy(name, retries = 3) {
	const place = PLACES[name];
	if (!place) {
		console.error(`Unknown place: ${name}`);
		process.exit(1);
	}

	console.log(`\nDeploying ${name}...`);

	let cmd;
	if (useApiKey) {
		console.log("Using Open Cloud API key...");
		cmd = `rojo upload ${place.project} --asset_id ${place.assetId} --universe_id ${UNIVERSE_ID} --api_key "${process.env.UNIVERSE_PUSH_API_KEY}"`;
	} else {
		console.log("Using ROBLOSECURITY cookie...");
		cmd = `rojo upload ${place.project} --asset_id ${place.assetId} --cookie "${process.env.ROBLOSECURITY}"`;
	}

	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			execSync(cmd, { stdio: "inherit", shell: true });
			console.log(`${name} deployed successfully!`);
			return;
		} catch (err) {
			if (attempt < retries) {
				const delay = attempt * 10; // 10s, 20s, 30s...
				console.log(`Attempt ${attempt} failed, retrying in ${delay} seconds...`);
				await sleep(delay * 1000);
			} else {
				throw err;
			}
		}
	}
}

async function main() {
	if (target === "all") {
		await deploy("lobby");
		await deploy("testing");
	} else if (target) {
		await deploy(target);
	} else {
		console.error("Usage: node scripts/deploy.js <lobby|testing|all>");
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});

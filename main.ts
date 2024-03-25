import fs from "fs";
import Spotify from "./spotify";
import Youtube from "./youtube";
import { delay } from "./utils";

const YT_PLAYLIST_ID = "PLFxAhK-oPlhcVg9UbBP3Kz3pEseSRFN9X";

async function main() {
	const spotifyCredentials = JSON.parse(fs.readFileSync("./spotify_secrets.json").toString());
	const youtubeCredentials = JSON.parse(fs.readFileSync("./youtube_secrets.json").toString());

	const spotify = new Spotify(spotifyCredentials);
	const youtube = new Youtube(youtubeCredentials);

	await spotify.init();
	await youtube.init();

	const playlist = await spotify.getPlaylist("2meFu1SRl8VkbZWftSRxCq");

	let videosIds: Record<string, string | null> = {};

	// Create a json file to store the videos ids
	const playlistName = playlist.name.replace(" ", "").toLowerCase();

	// Check if the file already exists
	if (fs.existsSync(`./${playlistName}.json`)) videosIds = JSON.parse(fs.readFileSync(`./${playlistName}.json`).toString());
	else fs.writeFileSync(`./${playlistName}.json`, JSON.stringify(videosIds));

	// Search for all videos in the list each 500ms
	for (const track of playlist.tracks.items) {
		console.log(`[i] Searching for: ${track.track.name}...`);

		// Check if the track is already in the json file
		if (videosIds[track.track.id]) {
			console.log(`[i] Found video in json file: ${videosIds[track.track.id]}! Skipping...`);
			continue;
		}

		const video = await youtube.searchVideo(
			`${track.track.name} - ${track.track.artists.map((artist) => artist.name).join(", ")}`
		);

		console.log(`[i] Found video: ${video}!`);

		videosIds[track.track.id] = video;

		// Update the json file
		fs.writeFileSync(`./${playlistName}.json`, JSON.stringify(videosIds));

		await delay(500);
	}

	// Insert the video into the playlist

	//
}

main();

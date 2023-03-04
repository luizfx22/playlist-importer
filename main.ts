import fs from "fs";
import axios from "axios";
import express from "express";
import open from "open";
import * as Spotify from "./spotify";
import Youtube from "./youtube";

const credentials = JSON.parse(fs.readFileSync("./spotify_secrets.json").toString());

const client_id = credentials.clientId;
const client_secret = credentials.clientSecret;
const redirect_uri = credentials.redirectUri;
const scopes = ["playlist-read-private"];

const authUrl = `https://accounts.spotify.com/authorize?client_id=${client_id}&response_type=code&redirect_uri=${redirect_uri}&scope=${scopes.join(
	"%20"
)}`;

// Read spotify-token.json to see if we have a token stored and if it's still valid
let token = JSON.parse(fs.readFileSync("./spotify-token.json").toString());

if (!token) {
	const app = express();

	const server = app.listen(80, () => {
		console.log("Listening on port 80");
	});

	app.get("/spotify", async (req, res) => {
		const code = req.query.code;
		const auth = Buffer.from(`${client_id}:${client_secret}`).toString("base64");
		const { data } = await axios.post(
			"https://accounts.spotify.com/api/token",
			{
				grant_type: "authorization_code",
				code,
				redirect_uri,
			},
			{
				headers: {
					Authorization: `Basic ${auth}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
			}
		);

		// Store the token in spotify_tokens.json
		fs.writeFileSync("./spotify-token.json", JSON.stringify(data));

		token = data;

		res.send("Success! You can close this window now.").end();

		server.close();
	});

	// open browser to authUrl
	open(authUrl);
}

function getPlaylistAndTracks() {
	// Get a playlist
	axios
		.get("https://api.spotify.com/v1/playlists/2meFu1SRl8VkbZWftSRxCq", {
			headers: {
				Authorization: `Bearer ${token.access_token}`,
			},
		})
		.then(async (res) => {
			const total = res.data.tracks.total;
			const limit = res.data.tracks.limit;

			const pages = Math.ceil(total / limit);

			const tracks = [];

			for (let i = 0; i < pages; i++) {
				const { data } = await axios.get(
					`https://api.spotify.com/v1/playlists/2meFu1SRl8VkbZWftSRxCq/tracks?offset=${i * limit}`,
					{
						headers: {
							Authorization: `Bearer ${token.access_token}`,
						},
					}
				);

				tracks.push(...data.items);

				console.log(`Fetched page ${i + 1} of ${pages}`);
			}

			console.log(tracks);

			// store tracks in a file
			fs.writeFileSync("./tracks.json", JSON.stringify(tracks));
		});
}

function createYTSearch() {
	// Read tracks.json to see if we have a list of tracks stored
	let tracks = JSON.parse(fs.readFileSync("./tracks.json").toString()) as Spotify.PlaylistTrack[];

	const trackForYTSearch = [];

	for (const track of tracks) {
		const q = `${track.track.name} - ${track.track.artists.map((a) => a.name).join(", ")}`;

		trackForYTSearch.push(q);
	}

	// store tracks in a file
	fs.writeFileSync("./tracks-for-yt-search.json", JSON.stringify(trackForYTSearch));
}

// Read youtube_secrets.json to see if we have a token stored and if it's still valid
const ytCredentials = JSON.parse(fs.readFileSync("./youtube_secrets.json").toString());

const yt = new Youtube(ytCredentials);

async function youtubeMusicFind() {
	await yt.init();

	const playlist = await yt.createPlaylist(`House Roor ${Math.ceil(Math.random() * 1000)}`);

	// Read tracks-for-yt-search.json to see if we have a list of tracks stored
	let tracks = JSON.parse(fs.readFileSync("./tracks-for-yt-search.json").toString()) as string[];

	for (const track of tracks) {
		const video = await yt.searchVideo(track);

		if (!video) {
			console.log(`No video found for ${track}`);
			continue;
		}

		if (!playlist) {
			console.log(`No playlist found`);
			break;
		}

		await yt.addVideoToPlaylist(playlist as string, video as string);

		console.log(`Added ${track} to playlist`);

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

youtubeMusicFind();

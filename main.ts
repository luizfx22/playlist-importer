import fs from "fs";
import axios from "axios";
import express from "express";
import open from "open";
import Spotify, { Playlist } from "./spotify";
import Youtube, { ePlaylistPrivacy } from "./youtube";

const spotifyCredentials = JSON.parse(fs.readFileSync("./spotify_secrets.json").toString());
const youtubeCredentials = JSON.parse(fs.readFileSync("./youtube_secrets.json").toString());

const spotify = new Spotify(spotifyCredentials);
const youtube = new Youtube(youtubeCredentials);

async function main() {
	// await spotify.init();
	// const playlist = await spotify.getPlaylist("2meFu1SRl8VkbZWftSRxCq");

	const playlist = JSON.parse(fs.readFileSync("./playlist.json").toString()) as Playlist;

	const playlistTracksNames = playlist.tracks.items.map(
		(item) => `${item.track.name} - ${item.track.artists.map((artist) => artist.name).join(", ")}`
	);

	// Create a new youtube playlist
	await youtube.init();

	const ytPlaylist = `House Roor ${Math.ceil(Math.random() * 1000)}`;

	console.log("Playlist name:", ytPlaylist);

	const youtubePlaylist = await youtube.createPlaylist(ytPlaylist);

	if (!youtubePlaylist) throw new Error("No playlist created");
	if (!youtubePlaylist?.id) throw new Error("No playlist id");

	let ran = 0;
	const error = [];

	// Search for each track in youtube
	for (const track of playlistTracksNames) {
		ran++;
		const searchResults = await youtube.searchVideo(track);
		const searchItems = searchResults.items;

		if (!searchItems?.length || !Array.isArray(searchItems)) {
			error.push(track);
			console.log("Error:", track, "(", ran, "/", playlistTracksNames.length, ")");
			continue;
		}

		if (!searchItems) {
			error.push(track);
			console.log("Error:", track, "(", ran, "/", playlistTracksNames.length, ")");
			continue;
		}

		const videoId = searchItems[0]?.id?.videoId;

		if (!videoId) {
			error.push(track);
			console.log("Error:", track, "(", ran, "/", playlistTracksNames.length, ")");
			continue;
		}

		// Add the track to the youtube playlist
		const result = await youtube.addVideoToPlaylist(youtubePlaylist.id, videoId).catch((e) => {
			console.log(e);
			return false;
		});

		if (!result) {
			error.push(track);
			console.log("Error:", track, "(", ran, "/", playlistTracksNames.length, ")");
			continue;
		}

		console.log("Added track:", track, "(", ran, "/", playlistTracksNames.length, ")");

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	// Store the error tracks
	fs.writeFileSync("./error.json", JSON.stringify(error, null, 2));
}

main();

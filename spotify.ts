import fs from "fs";
import open from "open";
import express from "express";
import axios from "axios";

export default class {
	private authURL: string;
	private spotifySecrets: ISpotifySecrets;
	private spotifyToken: ISpotifyToken = {} as ISpotifyToken;

	public spotifyTokenStoragePath = "./spotify_token.json";
	public scopes: string[] = ["playlist-read-private"];

	constructor(spotifySecrets: ISpotifySecrets) {
		const authUrl = `https://accounts.spotify.com/authorize?client_id={0}&response_type=code&redirect_uri={1}&scope={2}`;

		if (!spotifySecrets.clientId) throw new Error("Missing clientId");
		if (!spotifySecrets.clientSecret) throw new Error("Missing clientSecret");
		if (!spotifySecrets.redirectUri) throw new Error("Missing redirectUri");

		this.authURL = authUrl
			.replace("{0}", spotifySecrets.clientId)
			.replace("{1}", spotifySecrets.redirectUri)
			.replace("{2}", this.scopes.join("%20"));

		this.spotifySecrets = spotifySecrets;
	}

	public init() {
		const localSpotifyToken = this.readSpotifyToken();

		if (!localSpotifyToken) return this.getAccessToken();

		this.spotifyToken = localSpotifyToken;
	}

	/**
	 * Get playlist from Spotify
	 * @param playlistId
	 */
	public async getPlaylist(playlistId: string): Promise<Playlist> {
		const { data } = await axios.get<Playlist>(`https://api.spotify.com/v1/playlists/${playlistId}`, {
			headers: {
				Authorization: `Bearer ${this.spotifyToken.access_token}`,
			},
		});

		if (!data.tracks) throw new Error("No tracks found");

		const total = data.tracks.total;
		const limit = data.tracks.limit;

		const pages = Math.ceil(total / limit);

		const tracks = [];

		for (let i = 0; i < pages; i++) {
			const { data } = await axios.get<Tracks>(
				`https://api.spotify.com/v1/playlists/2meFu1SRl8VkbZWftSRxCq/tracks?offset=${i * limit}`,
				{
					headers: {
						Authorization: `Bearer ${this.spotifyToken.access_token}`,
					},
				}
			);

			tracks.push(...data.items);
		}

		const playlist: Playlist = {
			...data,
			tracks: {
				...data.tracks,
				items: tracks,
			},
		};

		return playlist;
	}

	private async getAccessToken(): Promise<ISpotifyToken> {
		const app = express();

		const server = app.listen(80, () => {
			console.log("Listening on port 80 (call `/spotify` in the redirect URI)");
		});

		app.get("/spotify", async (req, res) => {
			const code = req.query.code;
			const auth = Buffer.from(`${this.spotifySecrets.clientId}:${this.spotifySecrets.clientSecret}`).toString("base64");

			try {
				const { data } = await axios.post(
					"https://accounts.spotify.com/api/token",
					{
						grant_type: "authorization_code",
						code,
						redirect_uri: this.spotifySecrets.redirectUri,
					},
					{
						headers: {
							Authorization: `Basic ${auth}`,
							"Content-Type": "application/x-www-form-urlencoded",
						},
					}
				);

				// Store the token in spotify_tokens.json
				this.storeSpotfiyToken(data);

				this.spotifyToken = data;

				res.send("Success! You can close this window now.").end();

				return server.close();

				//
			} catch (error) {
				res.send(error).end();
			}
		});

		await open(this.authURL);

		return new Promise(async (resolve) => {
			server.on("close", () => {
				resolve(this.spotifyToken);
			});
		});
	}

	private storeSpotfiyToken(token: ISpotifyToken) {
		fs.writeFileSync(this.spotifyTokenStoragePath, JSON.stringify(token));
	}

	private readSpotifyToken(): ISpotifyToken | null {
		try {
			const token = fs.readFileSync(this.spotifyTokenStoragePath);
			return JSON.parse(token.toString());

			//
		} catch (error) {
			return null;
		}
	}
}

interface ISpotifySecrets {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

interface ISpotifyToken {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
}

export interface Playlist {
	collaborative: boolean;
	description: string;
	external_urls: ExternalUrls;
	followers: Followers;
	href: string;
	id: string;
	images: Image[];
	name: string;
	owner: Owner;
	primary_color: string;
	public: boolean;
	snapshot_id: string;
	tracks: Tracks;
	type: string;
	uri: string;
}

interface ExternalUrls {
	spotify: string;
}

interface Followers {
	href: any;
	total: number;
}

interface Image {
	height: any;
	url: string;
	width: any;
}

interface Owner {
	display_name: string;
	external_urls: ExternalUrls2;
	href: string;
	id: string;
	type: string;
	uri: string;
}

interface ExternalUrls2 {
	spotify: string;
}

interface Tracks {
	href: string;
	items: Item[];
	limit: number;
	next: any;
	offset: number;
	previous: any;
	total: number;
}

interface Item {
	added_at: string;
	added_by: AddedBy;
	is_local: boolean;
	primary_color: any;
	track: Track;
	video_thumbnail: VideoThumbnail;
}

interface AddedBy {
	external_urls: ExternalUrls3;
	href: string;
	id: string;
	type: string;
	uri: string;
}

interface ExternalUrls3 {
	spotify: string;
}

interface Track {
	album: Album;
	artists: Artist2[];
	available_markets: string[];
	disc_number: number;
	duration_ms: number;
	episode: boolean;
	explicit: boolean;
	external_ids: ExternalIds;
	external_urls: ExternalUrls7;
	href: string;
	id: string;
	is_local: boolean;
	name: string;
	popularity: number;
	preview_url: string;
	track: boolean;
	track_number: number;
	type: string;
	uri: string;
}

interface Album {
	album_type: string;
	artists: Artist[];
	available_markets: string[];
	external_urls: ExternalUrls5;
	href: string;
	id: string;
	images: Image2[];
	name: string;
	release_date: string;
	release_date_precision: string;
	total_tracks: number;
	type: string;
	uri: string;
}

interface Artist {
	external_urls: ExternalUrls4;
	href: string;
	id: string;
	name: string;
	type: string;
	uri: string;
}

interface ExternalUrls4 {
	spotify: string;
}

interface ExternalUrls5 {
	spotify: string;
}

interface Image2 {
	height: number;
	url: string;
	width: number;
}

interface Artist2 {
	external_urls: ExternalUrls6;
	href: string;
	id: string;
	name: string;
	type: string;
	uri: string;
}

interface ExternalUrls6 {
	spotify: string;
}

interface ExternalIds {
	isrc: string;
}

interface ExternalUrls7 {
	spotify: string;
}

interface VideoThumbnail {
	url: any;
}

import { Credentials, OAuth2Client } from "google-auth-library";
import { google, youtube_v3 } from "googleapis";
import fs from "fs";
import express from "express";
import { GaxiosError } from "gaxios";
import open from "open";
import YouTube from "youtube-sr";

type YTPlaylist = youtube_v3.Schema$Playlist;
type YTPlaylistInsert = youtube_v3.Params$Resource$Playlists$Insert;
type YTPlaylistItem = youtube_v3.Schema$PlaylistItem;

type YTSearchListResponse = youtube_v3.Schema$SearchListResponse;

export enum ePlaylistPrivacy {
	private = "private",
	public = "public",
	unlisted = "unlisted",
}

export default class {
	private _oauth2Client: OAuth2Client;
	private _youtubeApiScopes: string[] = ["https://www.googleapis.com/auth/youtube"];
	private _localTokenStoragePath: string = "./.tokens/youtube-token.json";
	private _googleService: youtube_v3.Youtube = {} as youtube_v3.Youtube;

	constructor(secrets: IOAuthSecrets) {
		if (!fs.existsSync("./.tokens")) fs.mkdirSync("./.tokens");

		this._oauth2Client = new google.auth.OAuth2(
			secrets.installed.client_id,
			secrets.installed.client_secret,
			secrets.installed.redirect_uris[0]
		);
	}

	public async init(): Promise<void> {
		// Check if we have previously stored a token.
		let token = await this.readStoredToken();

		if (!token) {
			await this.OAuth2Login();
			token = await this.readStoredToken();

			if (!token) throw new Error("No token stored after OAuth2 login");
		}

		// Check if token is still valid
		if (token?.expiry_date && token.expiry_date < Date.now()) {
			await this.OAuth2Login();
			const storedToken = await this.readStoredToken();

			if (!storedToken) throw new Error("No token stored after OAuth2 login");
		}

		// Set the credentials for the OAuth2 client to use
		this._oauth2Client.credentials = token;

		this._googleService = google.youtube({
			version: "v3",
			auth: this._oauth2Client,
		});
	}

	public async createPlaylist(
		playlistName: string,
		playlistDescription?: string,
		privacy: ePlaylistPrivacy = ePlaylistPrivacy.private
	): Promise<YTPlaylist> {
		const request: YTPlaylistInsert = {
			part: ["snippet", "status"],
			requestBody: {
				snippet: {
					title: playlistName,
				},
				status: {
					privacyStatus: privacy,
				},
			},
		};

		if (playlistDescription && request?.requestBody?.snippet) request.requestBody.snippet.description = playlistDescription;

		const response = await this._googleService.playlists.insert(request);

		if (!response || !response.data) throw new Error("No response from youtube api");
		if (response.status !== 200) throw new Error("Youtube api returned status code: " + response.status);

		return response.data;
	}

	public async addVideoToPlaylist(playlistId: string, videoId: string): Promise<YTPlaylistItem> {
		const response = await this._googleService.playlistItems.insert({
			part: ["snippet"],
			requestBody: {
				snippet: {
					playlistId,
					resourceId: {
						kind: "youtube#video",
						videoId,
					},
					position: 0,
				},
			},
		});

		if (!response || !response.data) throw new Error("No response from youtube api");
		if (response.status !== 200) throw new Error("Youtube api returned status code: " + response.status);

		return response.data;
	}

	/**
	 * Search the video by the query and returns the video id
	 * @param query Video id
	 * @returns
	 */
	public async searchVideo(query: string): Promise<string | null> {
		const search = await YouTube.search(query, { type: "video", limit: 1 });

		if (!search || search.length === 0) throw new Error("No videos found for query: " + query);

		const video = search[0];

		return video?.id ?? null;
	}

	private async OAuth2Login(): Promise<void> {
		return new Promise(async (resolve) => {
			const authUrl = this._oauth2Client.generateAuthUrl({
				access_type: "offline",
				scope: this._youtubeApiScopes,
			});

			const app = express();

			const authServer = app.listen(80, () => {
				console.log("Authentication server running on port 80");
			});

			app.get("/", async (req, res) => {
				const code: unknown = req.query.code?.toString();

				if (!code) return res.send("No code provided").end();
				if (typeof code !== "string") return res.send("Invalid code provided").end();

				const token = await this.getOAuth2Token(code);

				if (token instanceof Error) return res.send("Error getting token: " + token.message).end();

				// Set the credentials for the OAuth2 client to use
				this._oauth2Client.credentials = token;

				// Store the token to disk for later program executions
				await this.storeToken(token);

				res.send("Authentication successful! Please return to the console.").end();

				return authServer.close();
			});

			await open(authUrl);

			return authServer.on("close", () => {
				return resolve();
			});
		});
	}

	private async getOAuth2Token(oAuth2Code: string): Promise<Credentials | Error | GaxiosError<any>> {
		return new Promise((resolve, reject) => {
			this._oauth2Client.getToken(oAuth2Code, (err, tokens) => {
				if (err) return reject(err);
				if (!tokens) return reject(new Error("No tokens returned from OAuth2Client.getToken()"));
				return resolve(tokens);
			});
		});
	}

	private async readStoredToken(): Promise<Credentials | null> {
		return new Promise((resolve) => {
			fs.readFile(this._localTokenStoragePath, (err, token) => {
				if (err) return resolve(null);
				return resolve(JSON.parse(token.toString()));
			});
		});
	}

	private async storeToken(token: Credentials): Promise<void> {
		return new Promise((resolve, reject) => {
			fs.writeFile(this._localTokenStoragePath, JSON.stringify(token), (err) => {
				if (err) return reject(err);
				return resolve();
			});
		});
	}

	public static ReadSecrets(): IOAuthSecrets {
		return JSON.parse(fs.readFileSync("./secrets.json").toString());
	}
}

export interface IOAuthSecrets {
	installed: IOAuthSecretsFields;
}

interface IOAuthSecretsFields {
	client_id: string;
	project_id: string;
	auth_uri: string;
	token_uri: string;
	auth_provider_x509_cert_url: string;
	client_secret: string;
	redirect_uris: string[];
}

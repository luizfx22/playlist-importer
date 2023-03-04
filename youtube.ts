import { Credentials, OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import fs from "fs";
import express from "express";
import { GaxiosError } from "gaxios";
import open from "open";

export default class {
	private _oauth2Client: OAuth2Client;
	private _youtubeToken: Credentials = {} as Credentials;
	private _youtubeApiScopes: string[] = ["https://www.googleapis.com/auth/youtube"];
	private _localTokenStoragePath: string = "./youtube-token.json";

	constructor(secrets: IOAuthSecrets) {
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

			this._youtubeToken = storedToken;
		}

		// Set the credentials for the OAuth2 client to use
		this._oauth2Client.credentials = token;
	}

	public async createPlaylist(playlistName: string): Promise<unknown> {
		const service = google.youtube({
			version: "v3",
			auth: this._oauth2Client,
		});

		const response = await service.playlists.insert({
			part: ["snippet"],
			requestBody: {
				snippet: {
					title: playlistName,
				},
			},
		});

		return response.data.id;
	}

	public async addVideoToPlaylist(playlistId: string, videoId: string): Promise<void> {
		const youtube = google.youtube({
			version: "v3",
			auth: this._oauth2Client,
		});

		await youtube.playlistItems.insert({
			part: ["snippet"],
			requestBody: {
				snippet: {
					playlistId,
					resourceId: {
						kind: "youtube#video",
						videoId,
					},
				},
			},
		});

		return;
	}

	public async searchVideo(query: string): Promise<unknown> {
		const youtube = google.youtube({
			version: "v3",
			auth: this._oauth2Client,
		});

		const response = await youtube.search.list({
			part: ["snippet"],
			q: query,
			type: ["video"],
		});

		if (!response?.data?.items) throw new Error("No video found for query: " + query);
		if (response?.data?.items?.length === 0) throw new Error("No video found for query: " + query);

		return response?.data?.items[0]?.id?.videoId;
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

import http from "node:http";
import type { AddressInfo } from "node:net";

import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";

import { GMAIL_REQUIRED_SCOPES } from "../src/lib/gmail/scopes";

dotenv.config();

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

function getRequiredEnv(name: "GMAIL_CLIENT_ID" | "GMAIL_CLIENT_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function listen(server: http.Server): Promise<AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine OAuth callback address.");
  }

  return address;
}

async function waitForAuthorizationCode(server: http.Server, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for the Google OAuth callback."));
    }, CALLBACK_TIMEOUT_MS);

    server.on("request", (request, response) => {
      const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/oauth2callback") {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found.");
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        clearTimeout(timeout);
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end(`OAuth authorization failed: ${error}`);
        reject(new Error(`OAuth authorization failed: ${error}`));
        return;
      }

      if (!code) {
        clearTimeout(timeout);
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("OAuth callback did not include an authorization code.");
        reject(new Error("OAuth callback did not include an authorization code."));
        return;
      }

      clearTimeout(timeout);
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("Authorization received. Return to the terminal.");
      resolve(code);
    });
  });
}

async function main(): Promise<void> {
  const clientId = getRequiredEnv("GMAIL_CLIENT_ID");
  const clientSecret = getRequiredEnv("GMAIL_CLIENT_SECRET");

  const server = http.createServer();
  let callbackAddress: AddressInfo | null = null;

  try {
    callbackAddress = await listen(server);
    const redirectUri = `http://127.0.0.1:${callbackAddress.port}/oauth2callback`;
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [...GMAIL_REQUIRED_SCOPES]
    });

    console.log("");
    console.log("Open this URL in a browser and complete Google consent:");
    console.log(authUrl);
    console.log("");
    console.log("Requested Gmail scopes:");
    for (const scope of GMAIL_REQUIRED_SCOPES) {
      console.log(`- ${scope}`);
    }
    console.log("");
    console.log("Waiting for the OAuth callback on the local loopback listener...");

    const code = await waitForAuthorizationCode(server, callbackAddress.port);
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Re-run the flow with prompt=consent and remove any prior grant if needed."
      );
    }

    console.log("");
    console.log("Add this to your .env file:");
    console.log(`GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log("");
    console.log("If you changed scopes on an existing integration, run an email-history refresh after updating the token so degraded Gmail rows can be repaired.");
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

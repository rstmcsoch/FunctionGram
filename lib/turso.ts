import { createClient, type Client } from "@libsql/client";

let client: Client | undefined;

export function getTursoClient(): Client {
  if (client) return client;

    const url = process.env.TURSO_DATABASE_URL;
      const authToken = process.env.TURSO_AUTH_TOKEN;

        if (!url) {
            throw new Error("Missing TURSO_DATABASE_URL");
              }

                client = createClient({
                    url,
                        authToken,
                          });

                            return client;
                            }
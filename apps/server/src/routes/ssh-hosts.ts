import type { FastifyInstance } from "fastify";

import type { DirectorySuggestionsInput } from "@agent-orchestrator/shared";

import { listDirectorySuggestions } from "../services/directory-suggestions.js";
import { parseSshConfig } from "../services/ssh-config-parser.js";

export async function registerSshHostsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get("/api/ssh-hosts", async () => {
    const hosts = parseSshConfig();
    return { hosts };
  });

  fastify.post<{ Body: DirectorySuggestionsInput }>(
    "/api/directory-suggestions",
    async (request) => listDirectorySuggestions(request.body),
  );
}

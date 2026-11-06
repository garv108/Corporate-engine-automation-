import { app } from "./app.js";
import { config } from "./config.js";
import { closeDatabase } from "./db/pool.js";

const server = app.listen(config.API_PORT, config.API_HOST, () => {
  console.info(`CIAS API listening on http://${config.API_HOST}:${config.API_PORT}`);
});

let shuttingDown = false;

const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} received; closing HTTP server`);

  server.close((error) => {
    if (error) {
      console.error("Error while closing HTTP server", error);
      process.exitCode = 1;
    }

    void closeDatabase().catch((databaseError: unknown) => {
      console.error("Error while closing database pool", databaseError);
      process.exitCode = 1;
    });
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

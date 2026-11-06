import { app } from "./app.js";
import { config } from "./config.js";

const server = app.listen(config.API_PORT, config.API_HOST, () => {
  console.info(`CIAS API listening on http://${config.API_HOST}:${config.API_PORT}`);
});

const shutdown = (signal: string) => {
  console.info(`${signal} received; closing HTTP server`);
  server.close((error) => {
    if (error) {
      console.error("Error while closing server", error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

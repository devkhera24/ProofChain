import http from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";

const server = http.createServer(createApp());
server.listen(env.PORT, "0.0.0.0", () => logger.info(`API listening on :${env.PORT}`));

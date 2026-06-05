import { getRequestListener } from "@hono/node-server";

import app from "./app.js";

export default getRequestListener(app.fetch);

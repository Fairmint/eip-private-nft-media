import { getRequestListener } from "@hono/node-server";

import app from "../demo/api/app.js";

export default getRequestListener(app.fetch);

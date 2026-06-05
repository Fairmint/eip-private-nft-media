import { serve } from "@hono/node-server";

import app from "../api/app.js";

const port = Number(process.env.PORT ?? "3000");

serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port,
  },
  () => {
    console.log(`Demo API listening on http://127.0.0.1:${port}`);
  },
);

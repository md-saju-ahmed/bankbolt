import express from "express";
import { z } from "zod";
import { handleError, notFound } from "./errors.ts";

const app = express();
const api = express.Router();
const healthQuery = z.strictObject({});

app.disable("x-powered-by");

api.use(express.json());
api.get("/health", (request, response) => {
  healthQuery.parse(request.query);
  response.set("Cache-Control", "no-store").json({ status: "ok" });
});

app.use("/api/v1", api);
app.use(notFound);
app.use(handleError);

export default app;

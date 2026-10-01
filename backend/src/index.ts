import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";

const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: env.clientOrigin }));
app.use(healthRouter);

app.listen(env.port, () => {
  console.log(`Expense Tracker API listening on http://localhost:${env.port}`);
});

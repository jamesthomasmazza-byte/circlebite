import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { authRouter } from "./auth/routes.js";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", authRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

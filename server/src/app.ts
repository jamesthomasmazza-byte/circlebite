import cookieParser from "cookie-parser";
import express, { type Express } from "express";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

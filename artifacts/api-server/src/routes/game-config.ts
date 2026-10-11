import { Router, type IRouter } from "express";
import {
  GetGameConfigQueryParams,
  GetGameConfigResponse,
} from "@workspace/api-zod";
import { getGameConfig as buildGameConfig } from "../game-data";

const router: IRouter = Router();

router.get("/game/config", (req, res) => {
  const parsed = GetGameConfigQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported game language." });
    return;
  }
  const { language } = parsed.data;
  const config = GetGameConfigResponse.parse(buildGameConfig(language));
  res.json(config);
});

export default router;

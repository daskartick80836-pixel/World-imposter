import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameConfigRouter from "./game-config";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gameConfigRouter);

export default router;

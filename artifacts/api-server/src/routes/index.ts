import { Router, type IRouter } from "express";
import healthRouter from "./health";
import resultCacheRouter from "./result-cache";
import resultEmailRouter from "./result-email";

const router: IRouter = Router();

router.use(healthRouter);
router.use(resultCacheRouter);
router.use(resultEmailRouter);

export default router;

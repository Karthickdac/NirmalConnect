import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import newsRouter from "./news.js";
import eventsRouter from "./events.js";
import activitiesRouter from "./activities.js";
import galleryRouter from "./gallery.js";
import volunteersRouter from "./volunteers.js";
import faqsRouter from "./faqs.js";
import statsRouter from "./stats.js";
import grievancesRouter from "./grievances.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(newsRouter);
router.use(eventsRouter);
router.use(activitiesRouter);
router.use(galleryRouter);
router.use(volunteersRouter);
router.use(faqsRouter);
router.use(statsRouter);
router.use(grievancesRouter);

export default router;

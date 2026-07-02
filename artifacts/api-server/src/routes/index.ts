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
import adminRouter from "./admin.js";
import votersRouter from "./voters.js";
import votersAdvancedRouter from "./voters_advanced.js";
import householdsRouter from "./households.js";
import voterExportsRouter from "./voter_exports.js";
import siteRouter from "./site.js";
import mapRouter from "./map.js";
import developmentRouter from "./development.js";

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
router.use(siteRouter);
router.use(mapRouter);
router.use(developmentRouter);
router.use(adminRouter);
// votersAdvancedRouter MUST be mounted before votersRouter so its
// specific paths (/admin/voters/duplicates, /analytics, /merge, /bulk,
// /callsheet) win over votersRouter's catch-all /admin/voters/:id.
router.use(votersAdvancedRouter);
router.use(votersRouter);
router.use(householdsRouter);
router.use(voterExportsRouter);

export default router;

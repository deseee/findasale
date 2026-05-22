/**
 * ADR-076: Internal API routes — GitHub Actions scraper endpoint
 * Protected by x-scraper-key header
 */

import express from 'express';
import { prisma } from '../lib/prisma';
import { ingestFromGitHubActions } from '../controllers/internalScraperController';
import { runEnrichmentBackfill } from '../controllers/internalEnrichmentController';
import {
  triggerSaleDetailEnrichment,
  getSaleDetailEnrichmentStatus,
  getBatchOfUnenrichedSales,
  bulkUpsertEnrichedSales,
} from '../controllers/internalSaleDetailEnrichmentController';
import { sendOutreachEmails } from '../jobs/outreachEmailsCron';
import { runWebsiteEnrichmentBackfill } from '../jobs/websiteEnrichmentJob';
import { runInternalJob } from '../controllers/internalJobRunnerController';
import { runListingEnrichmentBatch } from '../controllers/internalListingEnrichmentController';
import { getBatchOfUngeocodedSales, bulkUpdateGeocodedSales } from '../controllers/internalGeocodingController';
import { runOrganizerContactBackfill } from '../controllers/internalOrganizerContactBackfillController';
import { runCategorySync } from '../jobs/categorySyncCron';
import { runLeadScoringBackfill } from '../services/leadScoringService';
import { runScrapeRun } from '../services/scraper/index';
import { runIndianaLicensingScraper } from '../services/scraper/sources/indianaLicensingScraper';
import { runIllinoisLicensingScraper } from '../services/scraper/sources/illinoisLicensingScraper';
import { runLouisianaLicensingScraper } from '../services/scraper/sources/louisianaLicensingScraper';
import { runNorthCarolinaLicensingScraper } from '../services/scraper/sources/northCarolinaLicensingScraper';
import { runVirginiaLicensingScraper } from '../services/scraper/sources/virginiaLicensingScraper';
import { runMissouriLicensingScraper } from '../services/scraper/sources/missouriLicensingScraper';
import { runOhioLicensingScraper } from '../services/scraper/sources/ohioLicensingScraper';
import { runTennesseeLicensingScraper } from '../services/scraper/sources/tennesseeLicensingScraper';
import { runVermontLicensingScraper } from '../services/scraper/sources/vermontLicensingScraper';
import { runWashingtonLicensingScraper } from '../services/scraper/sources/washingtonLicensingScraper';
import { runWisconsinLicensingScraper } from '../services/scraper/sources/wisconsinLicensingScraper';
import { runWestVirginiaLicensingScraper } from '../services/scraper/sources/westVirginiaLicensingScraper';
import { runWyomingLicensingScraper } from '../services/scraper/sources/wyomingLicensingScraper';
import { runAlaskaLicensingScraper } from '../services/scraper/sources/alaskaLicensingScraper';
import { runAlabamaLicensingScraper } from '../services/scraper/sources/alabamaLicensingScraper';
import { runArkansasLicensingScraper } from '../services/scraper/sources/arkansasLicensingScraper';
import { runArizonaLicensingScraper } from '../services/scraper/sources/arizonaLicensingScraper';
import { runCaliforniaLicensingScraper } from '../services/scraper/sources/californiaLicensingScraper';
import { runColoradoLicensingScraper } from '../services/scraper/sources/coloradoLicensingScraper';
import { runConnecticutLicensingScraper } from '../services/scraper/sources/connecticutLicensingScraper';
import { runDelawareLicensingScraper } from '../services/scraper/sources/delawareLicensingScraper';
import { runFloridaLicensingScraper } from '../services/scraper/sources/floridaLicensingScraper';
import { runGeorgiaLicensingScraper } from '../services/scraper/sources/georgiaLicensingScraper';
import { runHawaiiLicensingScraper } from '../services/scraper/sources/hawaiiLicensingScraper';
import { runIowaLicensingScraper } from '../services/scraper/sources/iowaLicensingScraper';
import { runIdahoLicensingScraper } from '../services/scraper/sources/idahoLicensingScraper';
import { runKansasLicensingScraper } from '../services/scraper/sources/kansasLicensingScraper';
import { runKentuckyLicensingScraper } from '../services/scraper/sources/kentuckyLicensingScraper';
import { runMassachusettsLicensingScraper } from '../services/scraper/sources/massachusettsLicensingScraper';
import { runMarylandLicensingScraper } from '../services/scraper/sources/marylandLicensingScraper';
import { runMaineLicensingScraper } from '../services/scraper/sources/maineLicensingScraper';
import { runMichiganLicensingScraper } from '../services/scraper/sources/michiganLicensingScraper';
import { runMinnesotaLicensingScraper } from '../services/scraper/sources/minnesotaLicensingScraper';
import { runMississippiLicensingScraper } from '../services/scraper/sources/mississippiLicensingScraper';
import { runMontanaLicensingScraper } from '../services/scraper/sources/montanaLicensingScraper';
import { runNebraskaLicensingScraper } from '../services/scraper/sources/nebraskaLicensingScraper';
import { runNorthDakotaLicensingScraper } from '../services/scraper/sources/northDakotaLicensingScraper';
import { runNewHampshireLicensingScraper } from '../services/scraper/sources/newHampshireLicensingScraper';
import { runNewJerseyLicensingScraper } from '../services/scraper/sources/newJerseyLicensingScraper';
import { runNewMexicoLicensingScraper } from '../services/scraper/sources/newMexicoLicensingScraper';
import { runNevadaLicensingScraper } from '../services/scraper/sources/nevadaLicensingScraper';
import { runNewYorkLicensingScraper } from '../services/scraper/sources/newYorkLicensingScraper';
import { runOklahomaLicensingScraper } from '../services/scraper/sources/oklahomaLicensingScraper';
import { runOregonLicensingScraper } from '../services/scraper/sources/oregonLicensingScraper';
import { runPennsylvaniaLicensingScraper } from '../services/scraper/sources/pennsylvaniaLicensingScraper';
import { runRhodeIslandLicensingScraper } from '../services/scraper/sources/rhodeIslandLicensingScraper';
import { runSouthCarolinaLicensingScraper } from '../services/scraper/sources/southCarolinaLicensingScraper';
import { runSouthDakotaLicensingScraper } from '../services/scraper/sources/southDakotaLicensingScraper';
import { runTexasLicensingScraper } from '../services/scraper/sources/texasLicensingScraper';
import { runUtahLicensingScraper } from '../services/scraper/sources/utahLicensingScraper';
import { runOsmScraper } from '../services/scraper/osmScraper';
import { scrapeTheSaleSeker, DEFAULT_METROS } from '../services/scraper/sources/saleSeeker';
import { scrapeGarageSaleFinder } from '../services/scraper/sources/garageSaleFinder';
import { runAuctionZipScraper } from '../services/scraper/sources/auctionZipScraper';
import { scrapeAuctionNinja } from '../services/scraper/sources/auctionNinjaScraper';
import { scrapeNAADirectory } from '../services/scraper/sources/naaAuctioneerDirectory';
import { runAlaskaPhase2Scraper } from '../services/scraper/sources/alaskaPhase2Scraper';
import { runArizonaPhase2Scraper } from '../services/scraper/sources/arizonaPhase2Scraper';
import { runCaliforniaPhase2Scraper } from '../services/scraper/sources/californiaPhase2Scraper';
import { runColoradoPhase2Scraper } from '../services/scraper/sources/coloradoPhase2Scraper';
import { runConnecticutPhase2Scraper } from '../services/scraper/sources/connecticutPhase2Scraper';
import { runDelawarePhase2Scraper } from '../services/scraper/sources/delawarePhase2Scraper';
import { runHawaiiPhase2Scraper } from '../services/scraper/sources/hawaiiPhase2Scraper';
import { runIdahoPhase2Scraper } from '../services/scraper/sources/idahoPhase2Scraper';
import { runIllinoisPhase2Scraper } from '../services/scraper/sources/illinoisPhase2Scraper';
import { runKansasPhase2Scraper } from '../services/scraper/sources/kansasPhase2Scraper';
import { runMichiganPhase2Scraper } from '../services/scraper/sources/michiganPhase2Scraper';
import { runMinnesotaPhase2Scraper } from '../services/scraper/sources/minnesotaPhase2Scraper';
import { runMissouriPhase2Scraper } from '../services/scraper/sources/missouriPhase2Scraper';
import { runMontanaPhase2Scraper } from '../services/scraper/sources/montanaPhase2Scraper';
import { runNebraskaPhase2Scraper } from '../services/scraper/sources/nebraskaPhase2Scraper';
import { runNevadaPhase2Scraper } from '../services/scraper/sources/nevadaPhase2Scraper';
import { runNewJerseyPhase2Scraper } from '../services/scraper/sources/newjerseyPhase2Scraper';
import { runNewMexicoPhase2Scraper } from '../services/scraper/sources/newmexicoPhase2Scraper';
import { runNewYorkPhase2Scraper } from '../services/scraper/sources/newyorkPhase2Scraper';
import { runOklahomaphase2Scraper } from '../services/scraper/sources/oklahomaphase2Scraper';
import { runOregonPhase2Scraper } from '../services/scraper/sources/oregonPhase2Scraper';
import { runPennsylvaniaPhase2Scraper } from '../services/scraper/sources/pennsylvaniaPhase2Scraper';
import { runRhodeIslandPhase2Scraper } from '../services/scraper/sources/rhodeislandPhase2Scraper';
import { runTexasPhase2Scraper } from '../services/scraper/sources/texasPhase2Scraper';
import { runUtahPhase2Scraper } from '../services/scraper/sources/utahPhase2Scraper';
import { runVirginiaPhase2Scraper } from '../services/scraper/sources/virginiaPhase2Scraper';
import { runWashingtonPhase2Scraper } from '../services/scraper/sources/washingtonPhase2Scraper';
import { runWyomingPhase2Scraper } from '../services/scraper/sources/wyomingPhase2Scraper';
import { runVirginiaGeneralPhase2Scraper } from '../services/scraper/sources/virginiaGeneralPhase2Scraper';
import { runFloridaPhase2Scraper } from '../services/scraper/sources/floridaPhase2Scraper';
import { runGeorgiaPhase2Scraper } from '../services/scraper/sources/georgiaPhase2Scraper';
import { runNorthCarolinaPhase2Scraper } from '../services/scraper/sources/northCarolinaPhase2Scraper';
import { runOhioPhase2Scraper } from '../services/scraper/sources/ohioPhase2Scraper';
import { runCanada411Scraper } from '../services/scraper/sources/canada411Scraper';
import { runYellowPagesCaScraper } from '../services/scraper/sources/yellowPagesCaScraper';
import { runAlabamaPhase2Scraper } from '../services/scraper/sources/alabamaPhase2Scraper';
import { runKentuckyPhase2Scraper } from '../services/scraper/sources/kentuckyPhase2Scraper';
import { runMainePhase2Scraper } from '../services/scraper/sources/mainePhase2Scraper';
import { runIowaPhase2Scraper } from '../services/scraper/sources/iowaPhase2Scraper';
import { runWisconsinPhase2Scraper } from '../services/scraper/sources/wisconsinPhase2Scraper';
import { runLouisianaPhase2Scraper } from '../services/scraper/sources/louisianaPhase2Scraper';
import { runArkansasPhase2Scraper } from '../services/scraper/sources/arkansasPhase2Scraper';
import { runMississippiPhase2Scraper } from '../services/scraper/sources/mississippiPhase2Scraper';
import { runSouthCarolinaPhase2Scraper } from '../services/scraper/sources/southCarolinaPhase2Scraper';
import { runIndianaPhase2Scraper } from '../services/scraper/sources/indianaPhase2Scraper';
import { runMarylandPhase2Scraper } from '../services/scraper/sources/marylandPhase2Scraper';
import { runMassachusettsPhase2Scraper } from '../services/scraper/sources/massachusettsPhase2Scraper';
import { runNewHampshirePhase2Scraper } from '../services/scraper/sources/newHampshirePhase2Scraper';
import { runNorthDakotaPhase2Scraper } from '../services/scraper/sources/northDakotaPhase2Scraper';
import { runSouthDakotaPhase2Scraper } from '../services/scraper/sources/southDakotaPhase2Scraper';
import { runTennesseePhase2Scraper } from '../services/scraper/sources/tennesseePhase2Scraper';
import { runVermontPhase2Scraper } from '../services/scraper/sources/vermontPhase2Scraper';
import { runWestVirginiaPhase2Scraper } from '../services/scraper/sources/westVirginiaPhase2Scraper';

const router = express.Router();

const requireSecret = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.OUTREACH_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

// POST /api/internal/scraper/ingest — accept scraped items from GitHub Actions
router.post('/scraper/ingest', ingestFromGitHubActions);

// POST /api/internal/scraper/enrich-backfill — backfill Google Places data on unmanaged listings
router.post('/scraper/enrich-backfill', requireSecret, runEnrichmentBackfill);

// POST /api/internal/scraper/run-indiana-licensing
router.post('/scraper/run-indiana-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Indiana licensing scraper started' });
  runIndianaLicensingScraper().catch(err => console.error('[Indiana] scraper error:', err));
});

// POST /api/internal/scraper/run-illinois-licensing
router.post('/scraper/run-illinois-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Illinois licensing scraper started' });
  runIllinoisLicensingScraper().catch(err => console.error('[Illinois] scraper error:', err));
});

// POST /api/internal/scraper/run-louisiana-licensing
router.post('/scraper/run-louisiana-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Louisiana licensing scraper started' });
  runLouisianaLicensingScraper().catch(err => console.error('[Louisiana] scraper error:', err));
});

// POST /api/internal/scraper/run-north-carolina-licensing
router.post('/scraper/run-north-carolina-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'North Carolina licensing scraper started' });
  runNorthCarolinaLicensingScraper().catch(err => console.error('[NorthCarolina] scraper error:', err));
});

// POST /api/internal/scraper/run-virginia-licensing
router.post('/scraper/run-virginia-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Virginia licensing scraper started' });
  runVirginiaLicensingScraper().catch(err => console.error('[Virginia] scraper error:', err));
});

// POST /api/internal/scraper/run-missouri-licensing
router.post('/scraper/run-missouri-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Missouri licensing scraper started' });
  runMissouriLicensingScraper().catch(err => console.error('[Missouri] scraper error:', err));
});

// POST /api/internal/scraper/run-ohio-licensing
router.post('/scraper/run-ohio-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Ohio licensing scraper started' });
  runOhioLicensingScraper().catch(err => console.error('[Ohio] scraper error:', err));
});

// POST /api/internal/scraper/run-tennessee-licensing
router.post('/scraper/run-tennessee-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Tennessee licensing scraper started' });
  runTennesseeLicensingScraper().catch(err => console.error('[Tennessee] scraper error:', err));
});

// POST /api/internal/scraper/run-vermont-licensing
router.post('/scraper/run-vermont-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Vermont licensing scraper started' });
  runVermontLicensingScraper().catch(err => console.error('[Vermont] scraper error:', err));
});

// POST /api/internal/scraper/run-washington-licensing
router.post('/scraper/run-washington-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Washington licensing scraper started' });
  runWashingtonLicensingScraper().catch(err => console.error('[Washington] scraper error:', err));
});

// POST /api/internal/scraper/run-wisconsin-licensing
router.post('/scraper/run-wisconsin-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Wisconsin licensing scraper started' });
  runWisconsinLicensingScraper().catch(err => console.error('[Wisconsin] scraper error:', err));
});

// POST /api/internal/scraper/run-west-virginia-licensing
router.post('/scraper/run-west-virginia-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'West Virginia licensing scraper started' });
  runWestVirginiaLicensingScraper().catch(err => console.error('[WestVirginia] scraper error:', err));
});

// POST /api/internal/scraper/run-wyoming-licensing
router.post('/scraper/run-wyoming-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Wyoming licensing scraper started' });
  runWyomingLicensingScraper().catch(err => console.error('[Wyoming] scraper error:', err));
});

// POST /api/internal/scraper/run-alaska-licensing
router.post('/scraper/run-alaska-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Alaska licensing scraper started' });
  runAlaskaLicensingScraper().catch(err => console.error('[Alaska] scraper error:', err));
});

// POST /api/internal/scraper/run-alabama-licensing
router.post('/scraper/run-alabama-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Alabama licensing scraper started' });
  runAlabamaLicensingScraper().catch(err => console.error('[Alabama] scraper error:', err));
});

// POST /api/internal/scraper/run-arkansas-licensing
router.post('/scraper/run-arkansas-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Arkansas licensing scraper started' });
  runArkansasLicensingScraper().catch(err => console.error('[Arkansas] scraper error:', err));
});

// POST /api/internal/scraper/run-arizona-licensing
router.post('/scraper/run-arizona-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Arizona licensing scraper started' });
  runArizonaLicensingScraper().catch(err => console.error('[Arizona] scraper error:', err));
});

// POST /api/internal/scraper/run-california-licensing
router.post('/scraper/run-california-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'California licensing scraper started' });
  runCaliforniaLicensingScraper().catch(err => console.error('[California] scraper error:', err));
});

// POST /api/internal/scraper/run-colorado-licensing
router.post('/scraper/run-colorado-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Colorado licensing scraper started' });
  runColoradoLicensingScraper().catch(err => console.error('[Colorado] scraper error:', err));
});

// POST /api/internal/scraper/run-connecticut-licensing
router.post('/scraper/run-connecticut-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Connecticut licensing scraper started' });
  runConnecticutLicensingScraper().catch(err => console.error('[Connecticut] scraper error:', err));
});

// POST /api/internal/scraper/run-delaware-licensing
router.post('/scraper/run-delaware-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Delaware licensing scraper started' });
  runDelawareLicensingScraper().catch(err => console.error('[Delaware] scraper error:', err));
});

// POST /api/internal/scraper/run-florida-licensing
router.post('/scraper/run-florida-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Florida licensing scraper started' });
  runFloridaLicensingScraper().catch(err => console.error('[Florida] scraper error:', err));
});

// POST /api/internal/scraper/run-georgia-licensing
router.post('/scraper/run-georgia-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Georgia licensing scraper started' });
  runGeorgiaLicensingScraper().catch(err => console.error('[Georgia] scraper error:', err));
});

// POST /api/internal/scraper/run-hawaii-licensing
router.post('/scraper/run-hawaii-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Hawaii licensing scraper started' });
  runHawaiiLicensingScraper().catch(err => console.error('[Hawaii] scraper error:', err));
});

// POST /api/internal/scraper/run-iowa-licensing
router.post('/scraper/run-iowa-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Iowa licensing scraper started' });
  runIowaLicensingScraper().catch(err => console.error('[Iowa] scraper error:', err));
});

// POST /api/internal/scraper/run-idaho-licensing
router.post('/scraper/run-idaho-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Idaho licensing scraper started' });
  runIdahoLicensingScraper().catch(err => console.error('[Idaho] scraper error:', err));
});

// POST /api/internal/scraper/run-kansas-licensing
router.post('/scraper/run-kansas-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Kansas licensing scraper started' });
  runKansasLicensingScraper().catch(err => console.error('[Kansas] scraper error:', err));
});

// POST /api/internal/scraper/run-kentucky-licensing
router.post('/scraper/run-kentucky-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Kentucky licensing scraper started' });
  runKentuckyLicensingScraper().catch(err => console.error('[Kentucky] scraper error:', err));
});

// POST /api/internal/scraper/run-massachusetts-licensing
router.post('/scraper/run-massachusetts-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Massachusetts licensing scraper started' });
  runMassachusettsLicensingScraper().catch(err => console.error('[Massachusetts] scraper error:', err));
});

// POST /api/internal/scraper/run-maryland-licensing
router.post('/scraper/run-maryland-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Maryland licensing scraper started' });
  runMarylandLicensingScraper().catch(err => console.error('[Maryland] scraper error:', err));
});

// POST /api/internal/scraper/run-maine-licensing
router.post('/scraper/run-maine-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Maine licensing scraper started' });
  runMaineLicensingScraper().catch(err => console.error('[Maine] scraper error:', err));
});

// POST /api/internal/scraper/run-michigan-licensing
router.post('/scraper/run-michigan-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Michigan licensing scraper started' });
  runMichiganLicensingScraper().catch(err => console.error('[Michigan] scraper error:', err));
});

// POST /api/internal/scraper/run-minnesota-licensing
router.post('/scraper/run-minnesota-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Minnesota licensing scraper started' });
  runMinnesotaLicensingScraper().catch(err => console.error('[Minnesota] scraper error:', err));
});

// POST /api/internal/scraper/run-mississippi-licensing
router.post('/scraper/run-mississippi-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Mississippi licensing scraper started' });
  runMississippiLicensingScraper().catch(err => console.error('[Mississippi] scraper error:', err));
});

// POST /api/internal/scraper/run-montana-licensing
router.post('/scraper/run-montana-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Montana licensing scraper started' });
  runMontanaLicensingScraper().catch(err => console.error('[Montana] scraper error:', err));
});

// POST /api/internal/scraper/run-nebraska-licensing
router.post('/scraper/run-nebraska-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Nebraska licensing scraper started' });
  runNebraskaLicensingScraper().catch(err => console.error('[Nebraska] scraper error:', err));
});

// POST /api/internal/scraper/run-north-dakota-licensing
router.post('/scraper/run-north-dakota-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'North Dakota licensing scraper started' });
  runNorthDakotaLicensingScraper().catch(err => console.error('[NorthDakota] scraper error:', err));
});

// POST /api/internal/scraper/run-new-hampshire-licensing
router.post('/scraper/run-new-hampshire-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'New Hampshire licensing scraper started' });
  runNewHampshireLicensingScraper().catch(err => console.error('[NewHampshire] scraper error:', err));
});

// POST /api/internal/scraper/run-new-jersey-licensing
router.post('/scraper/run-new-jersey-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'New Jersey licensing scraper started' });
  runNewJerseyLicensingScraper().catch(err => console.error('[NewJersey] scraper error:', err));
});

// POST /api/internal/scraper/run-new-mexico-licensing
router.post('/scraper/run-new-mexico-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'New Mexico licensing scraper started' });
  runNewMexicoLicensingScraper().catch(err => console.error('[NewMexico] scraper error:', err));
});

// POST /api/internal/scraper/run-nevada-licensing
router.post('/scraper/run-nevada-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Nevada licensing scraper started' });
  runNevadaLicensingScraper().catch(err => console.error('[Nevada] scraper error:', err));
});

// POST /api/internal/scraper/run-new-york-licensing
router.post('/scraper/run-new-york-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'New York licensing scraper started' });
  runNewYorkLicensingScraper().catch(err => console.error('[NewYork] scraper error:', err));
});

// POST /api/internal/scraper/run-oklahoma-licensing
router.post('/scraper/run-oklahoma-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Oklahoma licensing scraper started' });
  runOklahomaLicensingScraper().catch(err => console.error('[Oklahoma] scraper error:', err));
});

// POST /api/internal/scraper/run-oregon-licensing
router.post('/scraper/run-oregon-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Oregon licensing scraper started' });
  runOregonLicensingScraper().catch(err => console.error('[Oregon] scraper error:', err));
});

// POST /api/internal/scraper/run-pennsylvania-licensing
router.post('/scraper/run-pennsylvania-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Pennsylvania licensing scraper started' });
  runPennsylvaniaLicensingScraper().catch(err => console.error('[Pennsylvania] scraper error:', err));
});

// POST /api/internal/scraper/run-rhode-island-licensing
router.post('/scraper/run-rhode-island-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Rhode Island licensing scraper started' });
  runRhodeIslandLicensingScraper().catch(err => console.error('[RhodeIsland] scraper error:', err));
});

// POST /api/internal/scraper/run-south-carolina-licensing
router.post('/scraper/run-south-carolina-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'South Carolina licensing scraper started' });
  runSouthCarolinaLicensingScraper().catch(err => console.error('[SouthCarolina] scraper error:', err));
});

// POST /api/internal/scraper/run-south-dakota-licensing
router.post('/scraper/run-south-dakota-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'South Dakota licensing scraper started' });
  runSouthDakotaLicensingScraper().catch(err => console.error('[SouthDakota] scraper error:', err));
});

// POST /api/internal/scraper/run-texas-licensing
router.post('/scraper/run-texas-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Texas licensing scraper started' });
  runTexasLicensingScraper().catch(err => console.error('[Texas] scraper error:', err));
});

// POST /api/internal/scraper/run-utah-licensing
router.post('/scraper/run-utah-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'Utah licensing scraper started' });
  runUtahLicensingScraper().catch(err => console.error('[Utah] scraper error:', err));
});

// POST /api/internal/scraper/run-osm
router.post('/scraper/run-osm', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'OSM scraper started' });
  runOsmScraper().catch(err => console.error('[OSM] scraper error:', err));
});

// POST /api/internal/scraper/run-sale-seeker
router.post('/scraper/run-sale-seeker', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'SaleSeker scraper started' });
  (async () => {
    try {
      const { getOrCreateSystemOrganizer } = await import('../services/scraper/index');
      const organizerId = await getOrCreateSystemOrganizer();
      const metros = req.body?.metros || DEFAULT_METROS;
      for (const metro of metros) {
        try {
          const { defaultRateLimiter } = await import('../services/scraper/index');
          await scrapeTheSaleSeker(metro, organizerId, defaultRateLimiter);
        } catch (err) {
          console.error(`[SaleSeker] Metro ${metro} failed:`, err);
        }
      }
    } catch (error: any) {
      console.error('[SaleSeker] scraper error:', error);
    }
  })();
});

// POST /api/internal/scraper/run-garagesalefinder
router.post('/scraper/run-garagesalefinder', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'GarageSaleFinder scraper started' });
  (async () => {
    try {
      const { getOrCreateSystemOrganizer, defaultRateLimiter } = await import('../services/scraper/index');
      const organizerId = await getOrCreateSystemOrganizer();
      const metros: string[] = req.body?.metros || DEFAULT_METROS;
      for (const metro of metros) {
        try {
          await scrapeGarageSaleFinder(metro, organizerId, defaultRateLimiter);
        } catch (err) {
          console.error(`[GarageSaleFinder] Metro ${metro} failed:`, err);
        }
      }
    } catch (error: any) {
      console.error('[GarageSaleFinder] scraper error:', error);
    }
  })();
});

// POST /api/internal/scraper/run-auctionzip
router.post('/scraper/run-auctionzip', requireSecret, async (req: express.Request, res: express.Response) => {
  const letters = Array.isArray(req.body?.letters) ? req.body.letters : undefined;
  res.status(202).json({ message: 'AuctionZip scraper started' });
  runAuctionZipScraper(letters).catch(err => console.error('[AuctionZip] scraper error:', err));
});

// POST /api/internal/scraper/run-auction-ninja
router.post('/scraper/run-auction-ninja', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'AuctionNinja scraper started' });
  scrapeAuctionNinja().catch(err => console.error('[AuctionNinja] scraper error:', err));
});

// POST /api/internal/scraper/run-naa
router.post('/scraper/run-naa', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ message: 'NAA scraper started' });
  scrapeNAADirectory().catch(err => console.error('[NAA] scraper error:', err));
});

// POST /api/internal/outreach/send
// Responds immediately and runs batch in background to avoid Railway's 30s HTTP proxy timeout.
router.post('/outreach/send', requireSecret, (req: express.Request, res: express.Response) => {
  res.json({ success: true, message: 'Outreach email batch started in background' });
  sendOutreachEmails().catch((error: any) => {
    console.error('[OutreachManual] Route error:', error);
  });
});

// GET /api/internal/outreach/status
router.get('/outreach/status', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const warmupStart = process.env.OUTREACH_WARMUP_START_DATE
      ? new Date(process.env.OUTREACH_WARMUP_START_DATE)
      : new Date('2026-05-06');
    const warmupDay = Math.floor((now.getTime() - warmupStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const [total, statusPending, statusSent, statusBounced, statusOptedOut, statusClaimed, touch1Sent, touch2Sent, touch3Sent, touch4Sent, completed, last24hCount, last7dCount, suppressed, hotCount, warmCount, coldCount, tieredCount] = await Promise.all([
      prisma.directoryClaimEmail.count(),
      prisma.directoryClaimEmail.count({ where: { status: 'PENDING' } }),
      prisma.directoryClaimEmail.count({ where: { status: 'SENT' } }),
      prisma.directoryClaimEmail.count({ where: { status: 'BOUNCED' } }),
      prisma.directoryClaimEmail.count({ where: { status: 'OPTED_OUT' } }),
      prisma.directoryClaimEmail.count({ where: { status: 'CLAIMED' } }),
      prisma.directoryClaimEmail.count({ where: { touch1SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch2SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch3SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch4SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch4SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { sentAt: { gte: last24h } } }),
      prisma.directoryClaimEmail.count({ where: { sentAt: { gte: last7d } } }),
      prisma.emailSuppression.count(),
      prisma.organizer.count({ where: { leadTier: 'HOT' } }),
      prisma.organizer.count({ where: { leadTier: 'WARM' } }),
      prisma.organizer.count({ where: { leadTier: 'COLD' } }),
      prisma.organizer.count({ where: { leadTier: { not: null } } }),
    ]);
    const totalOrganizers = await prisma.organizer.count();
    const untieredCount = totalOrganizers - tieredCount;
    res.json({ pipeline: { total, byStatus: { PENDING: statusPending, SENT: statusSent, BOUNCED: statusBounced, OPTED_OUT: statusOptedOut, CLAIMED: statusClaimed }, byTier: { HOT: hotCount, WARM: warmCount, COLD: coldCount, untiered: untieredCount }, touchProgress: { touch1Sent, touch2Sent, touch3Sent, touch4Sent, completed } }, recentSends: { last24h: last24hCount, last7d: last7dCount }, suppressed, warmupDay });
  } catch (err: any) {
    console.error('[OutreachStatus] Route error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/internal/enrich-sale-details
router.post('/enrich-sale-details', triggerSaleDetailEnrichment);
router.get('/enrich-sale-details/status', getSaleDetailEnrichmentStatus);
router.get('/enrich-sale-details/batch', getBatchOfUnenrichedSales);
router.post('/enrich-sale-details/bulk', bulkUpsertEnrichedSales);

// POST /api/internal/category-sync/trigger
router.post('/category-sync/trigger', requireSecret, async (req: express.Request, res: express.Response) => {
  res.json({ ok: true, message: 'Category sync started — check Railway logs for results' });
  try {
    await runCategorySync();
  } catch (err: any) {
    console.error('[CategorySync] Trigger error:', err);
  }
});

// POST /api/internal/scoring/run-backfill
router.post('/scoring/run-backfill', requireSecret, async (req: express.Request, res: express.Response) => {
  res.status(202).json({ ok: true, message: 'Lead scoring backfill started' });
  runLeadScoringBackfill().catch(err => console.error('[LeadScoring] Backfill error:', err));
});

// POST /api/internal/enrichment/run-website-backfill
router.post('/enrichment/run-website-backfill', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    res.status(202).json({ ok: true, message: 'Website enrichment backfill started' });
    runWebsiteEnrichmentBackfill().catch(err => console.error('[WebsiteEnrichment] Backfill route error:', err));
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
});

// Phase 2 scrapers
router.post('/scraper/run-alaska-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Alaska Phase 2 scraper started' }); runAlaskaPhase2Scraper().catch(err => console.error('[Alaska] scraper error:', err)); });
router.post('/scraper/run-arizona-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Arizona Phase 2 scraper started' }); runArizonaPhase2Scraper().catch(err => console.error('[Arizona] scraper error:', err)); });
router.post('/scraper/run-california-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'California Phase 2 scraper started' }); runCaliforniaPhase2Scraper().catch(err => console.error('[California] scraper error:', err)); });
router.post('/scraper/run-colorado-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Colorado Phase 2 scraper started' }); runColoradoPhase2Scraper().catch(err => console.error('[Colorado] scraper error:', err)); });
router.post('/scraper/run-connecticut-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Connecticut Phase 2 scraper started' }); runConnecticutPhase2Scraper().catch(err => console.error('[Connecticut] scraper error:', err)); });
router.post('/scraper/run-delaware-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Delaware Phase 2 scraper started' }); runDelawarePhase2Scraper().catch(err => console.error('[Delaware] scraper error:', err)); });
router.post('/scraper/run-hawaii-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Hawaii Phase 2 scraper started' }); runHawaiiPhase2Scraper().catch(err => console.error('[Hawaii] scraper error:', err)); });
router.post('/scraper/run-idaho-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Idaho Phase 2 scraper started' }); runIdahoPhase2Scraper().catch(err => console.error('[Idaho] scraper error:', err)); });
router.post('/scraper/run-illinois-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Illinois Phase 2 scraper started' }); runIllinoisPhase2Scraper().catch(err => console.error('[Illinois] scraper error:', err)); });
router.post('/scraper/run-kansas-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Kansas Phase 2 scraper started' }); runKansasPhase2Scraper().catch(err => console.error('[Kansas] scraper error:', err)); });
router.post('/scraper/run-michigan-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Michigan Phase 2 scraper started' }); runMichiganPhase2Scraper().catch(err => console.error('[Michigan] scraper error:', err)); });
router.post('/scraper/run-minnesota-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Minnesota Phase 2 scraper started' }); runMinnesotaPhase2Scraper().catch(err => console.error('[Minnesota] scraper error:', err)); });
router.post('/scraper/run-missouri-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Missouri Phase 2 scraper started' }); runMissouriPhase2Scraper().catch(err => console.error('[Missouri] scraper error:', err)); });
router.post('/scraper/run-montana-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Montana Phase 2 scraper started' }); runMontanaPhase2Scraper().catch(err => console.error('[Montana] scraper error:', err)); });
router.post('/scraper/run-nebraska-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Nebraska Phase 2 scraper started' }); runNebraskaPhase2Scraper().catch(err => console.error('[Nebraska] scraper error:', err)); });
router.post('/scraper/run-nevada-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Nevada Phase 2 scraper started' }); runNevadaPhase2Scraper().catch(err => console.error('[Nevada] scraper error:', err)); });
router.post('/scraper/run-new-jersey-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'New Jersey Phase 2 scraper started' }); runNewJerseyPhase2Scraper().catch(err => console.error('[NewJersey] scraper error:', err)); });
router.post('/scraper/run-new-mexico-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'New Mexico Phase 2 scraper started' }); runNewMexicoPhase2Scraper().catch(err => console.error('[NewMexico] scraper error:', err)); });
router.post('/scraper/run-new-york-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'New York Phase 2 scraper started' }); runNewYorkPhase2Scraper().catch(err => console.error('[NewYork] scraper error:', err)); });
router.post('/scraper/run-oklahoma-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Oklahoma Phase 2 scraper started' }); runOklahomaphase2Scraper().catch(err => console.error('[Oklahoma] scraper error:', err)); });
router.post('/scraper/run-oregon-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Oregon Phase 2 scraper started' }); runOregonPhase2Scraper().catch(err => console.error('[Oregon] scraper error:', err)); });
router.post('/scraper/run-pennsylvania-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Pennsylvania Phase 2 scraper started' }); runPennsylvaniaPhase2Scraper().catch(err => console.error('[Pennsylvania] scraper error:', err)); });
router.post('/scraper/run-rhode-island-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Rhode Island Phase 2 scraper started' }); runRhodeIslandPhase2Scraper().catch(err => console.error('[RhodeIsland] scraper error:', err)); });
router.post('/scraper/run-texas-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Texas Phase 2 scraper started' }); runTexasPhase2Scraper().catch(err => console.error('[Texas] scraper error:', err)); });
router.post('/scraper/run-utah-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Utah Phase 2 scraper started' }); runUtahPhase2Scraper().catch(err => console.error('[Utah] scraper error:', err)); });
router.post('/scraper/run-virginia-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Virginia Phase 2 scraper started' }); runVirginiaPhase2Scraper().catch(err => console.error('[Virginia] scraper error:', err)); });
router.post('/scraper/run-washington-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Washington Phase 2 scraper started' }); runWashingtonPhase2Scraper().catch(err => console.error('[Washington] scraper error:', err)); });
router.post('/scraper/run-wyoming-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Wyoming Phase 2 scraper started' }); runWyomingPhase2Scraper().catch(err => console.error('[Wyoming] scraper error:', err)); });
router.post('/scraper/run-florida-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Florida Phase 2 scraper started' }); runFloridaPhase2Scraper().catch(err => console.error('[Florida] scraper error:', err)); });
router.post('/scraper/run-georgia-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Georgia Phase 2 scraper started' }); runGeorgiaPhase2Scraper().catch(err => console.error('[Georgia] scraper error:', err)); });
router.post('/scraper/run-north-carolina-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'North Carolina Phase 2 scraper started' }); runNorthCarolinaPhase2Scraper().catch(err => console.error('[NorthCarolina] scraper error:', err)); });
router.post('/scraper/run-ohio-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Ohio Phase 2 scraper started' }); runOhioPhase2Scraper().catch(err => console.error('[Ohio] scraper error:', err)); });
router.post('/scraper/run-canada411', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Canada411 scraper started' }); runCanada411Scraper().catch(err => console.error('[Canada411] scraper error:', err)); });
router.post('/scraper/run-yellowpages-ca', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'YellowPages.ca scraper started' }); runYellowPagesCaScraper().catch(err => console.error('[YellowPagesCa] scraper error:', err)); });
router.post('/scraper/run-alabama-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Alabama Phase 2 scraper started' }); runAlabamaPhase2Scraper().catch(err => console.error('[Alabama] scraper error:', err)); });
router.post('/scraper/run-kentucky-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Kentucky Phase 2 scraper started' }); runKentuckyPhase2Scraper().catch(err => console.error('[Kentucky] scraper error:', err)); });
router.post('/scraper/run-maine-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Maine Phase 2 scraper started' }); runMainePhase2Scraper().catch(err => console.error('[Maine] scraper error:', err)); });
router.post('/scraper/run-iowa-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Iowa Phase 2 scraper started' }); runIowaPhase2Scraper().catch(err => console.error('[Iowa] scraper error:', err)); });
router.post('/scraper/run-wisconsin-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Wisconsin Phase 2 scraper started' }); runWisconsinPhase2Scraper().catch(err => console.error('[Wisconsin] scraper error:', err)); });
router.post('/scraper/run-louisiana-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Louisiana Phase 2 scraper started' }); runLouisianaPhase2Scraper().catch(err => console.error('[Louisiana] scraper error:', err)); });
router.post('/scraper/run-arkansas-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Arkansas Phase 2 scraper started' }); runArkansasPhase2Scraper().catch(err => console.error('[Arkansas] scraper error:', err)); });
router.post('/scraper/run-mississippi-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Mississippi Phase 2 scraper started' }); runMississippiPhase2Scraper().catch(err => console.error('[Mississippi] scraper error:', err)); });
router.post('/scraper/run-south-carolina-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'South Carolina Phase 2 scraper started' }); runSouthCarolinaPhase2Scraper().catch(err => console.error('[SouthCarolina] scraper error:', err)); });
router.post('/scraper/run-indiana-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Indiana Phase 2 scraper started' }); runIndianaPhase2Scraper().catch(err => console.error('[Indiana] scraper error:', err)); });
router.post('/scraper/run-maryland-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Maryland Phase 2 scraper started' }); runMarylandPhase2Scraper().catch(err => console.error('[Maryland] scraper error:', err)); });
router.post('/scraper/run-massachusetts-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Massachusetts Phase 2 scraper started' }); runMassachusettsPhase2Scraper().catch(err => console.error('[Massachusetts] scraper error:', err)); });
router.post('/scraper/run-new-hampshire-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'New Hampshire Phase 2 scraper started' }); runNewHampshirePhase2Scraper().catch(err => console.error('[NewHampshire] scraper error:', err)); });
router.post('/scraper/run-north-dakota-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'North Dakota Phase 2 scraper started' }); runNorthDakotaPhase2Scraper().catch(err => console.error('[NorthDakota] scraper error:', err)); });
router.post('/scraper/run-south-dakota-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'South Dakota Phase 2 scraper started' }); runSouthDakotaPhase2Scraper().catch(err => console.error('[SouthDakota] scraper error:', err)); });
router.post('/scraper/run-tennessee-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Tennessee Phase 2 scraper started' }); runTennesseePhase2Scraper().catch(err => console.error('[Tennessee] scraper error:', err)); });
router.post('/scraper/run-vermont-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Vermont Phase 2 scraper started' }); runVermontPhase2Scraper().catch(err => console.error('[Vermont] scraper error:', err)); });
router.post('/scraper/run-west-virginia-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'West Virginia Phase 2 scraper started' }); runWestVirginiaPhase2Scraper().catch(err => console.error('[WestVirginia] scraper error:', err)); });
router.post('/scraper/run-virginia-general-phase2', requireSecret, async (req: express.Request, res: express.Response) => { res.status(202).json({ message: 'Virginia General Phase 2 scraper started' }); runVirginiaGeneralPhase2Scraper().catch(err => console.error('[VirginiaGeneral] scraper error:', err)); });


// GET  /api/internal/geocode-ungeocoded-sales/batch — fetch sales missing lat/lng for GitHub Actions geocoding workflow
// POST /api/internal/geocode-ungeocoded-sales/bulk  — accept geocoded lat/lng results from GitHub Actions
router.get('/geocode-ungeocoded-sales/batch', getBatchOfUngeocodedSales);
router.post('/geocode-ungeocoded-sales/bulk', bulkUpdateGeocodedSales);

// POST /api/internal/enrich-listing-metadata - batch AI enrichment for scraped sales (GitHub Actions daily)
router.post('/enrich-listing-metadata', requireSecret, runListingEnrichmentBatch);

// POST /api/internal/backfill-organizer-contacts - free backfill: propagate contact data from scraped sales to organizers (GitHub Actions daily)
router.post('/backfill-organizer-contacts', requireSecret, runOrganizerContactBackfill);

// POST /api/internal/jobs/run - single dispatcher for background pipeline jobs (GitHub Actions cron)
router.post('/jobs/run', requireSecret, runInternalJob);

export default router;

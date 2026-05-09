/**
 * ADR-076: Internal API routes — GitHub Actions scraper endpoint
 * Protected by x-scraper-key header
 */

import express from 'express';
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
import { runAuctionZipScraper } from '../services/scraper/sources/auctionZipScraper';

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

// POST /api/internal/scraper/run-indiana-licensing — run Indiana auctioneer license scraper
router.post('/scraper/run-indiana-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runIndianaLicensingScraper();
    res.json({ success: true, message: 'Indiana licensing scraper completed' });
  } catch (error: any) {
    console.error('[IndianaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-illinois-licensing — run Illinois auctioneer license scraper
router.post('/scraper/run-illinois-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runIllinoisLicensingScraper();
    res.json({ success: true, message: 'Illinois licensing scraper completed' });
  } catch (error: any) {
    console.error('[IllinoisLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-louisiana-licensing — run Louisiana auctioneer license scraper
router.post('/scraper/run-louisiana-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runLouisianaLicensingScraper();
    res.json({ success: true, message: 'Louisiana licensing scraper completed' });
  } catch (error: any) {
    console.error('[LouisianaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-north-carolina-licensing — run North Carolina auctioneer license scraper
router.post('/scraper/run-north-carolina-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNorthCarolinaLicensingScraper();
    res.json({ success: true, message: 'North Carolina licensing scraper completed' });
  } catch (error: any) {
    console.error('[NorthCarolinaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-virginia-licensing — run Virginia auctioneer license scraper
router.post('/scraper/run-virginia-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runVirginiaLicensingScraper();
    res.json({ success: true, message: 'Virginia licensing scraper completed' });
  } catch (error: any) {
    console.error('[VirginiaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-missouri-licensing — run Missouri auctioneer license scraper
router.post('/scraper/run-missouri-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMissouriLicensingScraper();
    res.json({ success: true, message: 'Missouri licensing scraper completed' });
  } catch (error: any) {
    console.error('[MissouriLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-ohio-licensing — run Ohio auctioneer license scraper
router.post('/scraper/run-ohio-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runOhioLicensingScraper();
    res.json({ success: true, message: 'Ohio licensing scraper completed' });
  } catch (error: any) {
    console.error('[OhioLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-tennessee-licensing — run Tennessee auctioneer license scraper
router.post('/scraper/run-tennessee-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runTennesseeLicensingScraper();
    res.json({ success: true, message: 'Tennessee licensing scraper completed' });
  } catch (error: any) {
    console.error('[TennesseeLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-vermont-licensing — run Vermont auctioneer license scraper
router.post('/scraper/run-vermont-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runVermontLicensingScraper();
    res.json({ success: true, message: 'Vermont licensing scraper completed' });
  } catch (error: any) {
    console.error('[VermontLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-washington-licensing — run Washington auctioneer license scraper
router.post('/scraper/run-washington-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runWashingtonLicensingScraper();
    res.json({ success: true, message: 'Washington licensing scraper completed' });
  } catch (error: any) {
    console.error('[WashingtonLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-wisconsin-licensing — run Wisconsin auctioneer license scraper
router.post('/scraper/run-wisconsin-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runWisconsinLicensingScraper();
    res.json({ success: true, message: 'Wisconsin licensing scraper completed' });
  } catch (error: any) {
    console.error('[WisconsinLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-west-virginia-licensing — run West Virginia auctioneer license scraper
router.post('/scraper/run-west-virginia-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runWestVirginiaLicensingScraper();
    res.json({ success: true, message: 'West Virginia licensing scraper completed' });
  } catch (error: any) {
    console.error('[WestVirginiaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-wyoming-licensing — run Wyoming auctioneer license scraper
router.post('/scraper/run-wyoming-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runWyomingLicensingScraper();
    res.json({ success: true, message: 'Wyoming licensing scraper completed' });
  } catch (error: any) {
    console.error('[WyomingLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-alaska-licensing — run Alaska auctioneer license scraper
router.post('/scraper/run-alaska-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runAlaskaLicensingScraper();
    res.json({ success: true, message: 'Alaska licensing scraper completed' });
  } catch (error: any) {
    console.error('[AlaskaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-alabama-licensing
router.post('/scraper/run-alabama-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runAlabamaLicensingScraper();
    res.json({ success: true, message: 'Alabama licensing scraper completed' });
  } catch (error: any) {
    console.error('[AlabamaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-arkansas-licensing
router.post('/scraper/run-arkansas-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runArkansasLicensingScraper();
    res.json({ success: true, message: 'Arkansas licensing scraper completed' });
  } catch (error: any) {
    console.error('[ArkansasLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-arizona-licensing
router.post('/scraper/run-arizona-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runArizonaLicensingScraper();
    res.json({ success: true, message: 'Arizona licensing scraper completed' });
  } catch (error: any) {
    console.error('[ArizonaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-california-licensing
router.post('/scraper/run-california-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runCaliforniaLicensingScraper();
    res.json({ success: true, message: 'California licensing scraper completed' });
  } catch (error: any) {
    console.error('[CaliforniaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-colorado-licensing
router.post('/scraper/run-colorado-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runColoradoLicensingScraper();
    res.json({ success: true, message: 'Colorado licensing scraper completed' });
  } catch (error: any) {
    console.error('[ColoradoLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-connecticut-licensing
router.post('/scraper/run-connecticut-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runConnecticutLicensingScraper();
    res.json({ success: true, message: 'Connecticut licensing scraper completed' });
  } catch (error: any) {
    console.error('[ConnecticutLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-delaware-licensing
router.post('/scraper/run-delaware-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runDelawareLicensingScraper();
    res.json({ success: true, message: 'Delaware licensing scraper completed' });
  } catch (error: any) {
    console.error('[DelawareLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-florida-licensing
router.post('/scraper/run-florida-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runFloridaLicensingScraper();
    res.json({ success: true, message: 'Florida licensing scraper completed' });
  } catch (error: any) {
    console.error('[FloridaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-georgia-licensing
router.post('/scraper/run-georgia-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runGeorgiaLicensingScraper();
    res.json({ success: true, message: 'Georgia licensing scraper completed' });
  } catch (error: any) {
    console.error('[GeorgiaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-hawaii-licensing
router.post('/scraper/run-hawaii-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runHawaiiLicensingScraper();
    res.json({ success: true, message: 'Hawaii licensing scraper completed' });
  } catch (error: any) {
    console.error('[HawaiiLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-iowa-licensing
router.post('/scraper/run-iowa-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runIowaLicensingScraper();
    res.json({ success: true, message: 'Iowa licensing scraper completed' });
  } catch (error: any) {
    console.error('[IowaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-idaho-licensing
router.post('/scraper/run-idaho-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runIdahoLicensingScraper();
    res.json({ success: true, message: 'Idaho licensing scraper completed' });
  } catch (error: any) {
    console.error('[IdahoLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-kansas-licensing
router.post('/scraper/run-kansas-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runKansasLicensingScraper();
    res.json({ success: true, message: 'Kansas licensing scraper completed' });
  } catch (error: any) {
    console.error('[KansasLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-kentucky-licensing
router.post('/scraper/run-kentucky-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runKentuckyLicensingScraper();
    res.json({ success: true, message: 'Kentucky licensing scraper completed' });
  } catch (error: any) {
    console.error('[KentuckyLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-massachusetts-licensing
router.post('/scraper/run-massachusetts-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMassachusettsLicensingScraper();
    res.json({ success: true, message: 'Massachusetts licensing scraper completed' });
  } catch (error: any) {
    console.error('[MassachusettsLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-maryland-licensing
router.post('/scraper/run-maryland-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMarylandLicensingScraper();
    res.json({ success: true, message: 'Maryland licensing scraper completed' });
  } catch (error: any) {
    console.error('[MarylandLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-maine-licensing
router.post('/scraper/run-maine-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMaineLicensingScraper();
    res.json({ success: true, message: 'Maine licensing scraper completed' });
  } catch (error: any) {
    console.error('[MaineLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-michigan-licensing
router.post('/scraper/run-michigan-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMichiganLicensingScraper();
    res.json({ success: true, message: 'Michigan licensing scraper completed' });
  } catch (error: any) {
    console.error('[MichiganLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-minnesota-licensing
router.post('/scraper/run-minnesota-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMinnesotaLicensingScraper();
    res.json({ success: true, message: 'Minnesota licensing scraper completed' });
  } catch (error: any) {
    console.error('[MinnesotaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-mississippi-licensing
router.post('/scraper/run-mississippi-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMississippiLicensingScraper();
    res.json({ success: true, message: 'Mississippi licensing scraper completed' });
  } catch (error: any) {
    console.error('[MississippiLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-montana-licensing
router.post('/scraper/run-montana-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMontanaLicensingScraper();
    res.json({ success: true, message: 'Montana licensing scraper completed' });
  } catch (error: any) {
    console.error('[MontanaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-nebraska-licensing
router.post('/scraper/run-nebraska-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNebraskaLicensingScraper();
    res.json({ success: true, message: 'Nebraska licensing scraper completed' });
  } catch (error: any) {
    console.error('[NebraskaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-north-dakota-licensing
router.post('/scraper/run-north-dakota-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNorthDakotaLicensingScraper();
    res.json({ success: true, message: 'North Dakota licensing scraper completed' });
  } catch (error: any) {
    console.error('[NorthDakotaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-new-hampshire-licensing
router.post('/scraper/run-new-hampshire-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNewHampshireLicensingScraper();
    res.json({ success: true, message: 'New Hampshire licensing scraper completed' });
  } catch (error: any) {
    console.error('[NewHampshireLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-new-jersey-licensing
router.post('/scraper/run-new-jersey-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNewJerseyLicensingScraper();
    res.json({ success: true, message: 'New Jersey licensing scraper completed' });
  } catch (error: any) {
    console.error('[NewJerseyLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-new-mexico-licensing
router.post('/scraper/run-new-mexico-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNewMexicoLicensingScraper();
    res.json({ success: true, message: 'New Mexico licensing scraper completed' });
  } catch (error: any) {
    console.error('[NewMexicoLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-nevada-licensing
router.post('/scraper/run-nevada-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNevadaLicensingScraper();
    res.json({ success: true, message: 'Nevada licensing scraper completed' });
  } catch (error: any) {
    console.error('[NevadaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-new-york-licensing
router.post('/scraper/run-new-york-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNewYorkLicensingScraper();
    res.json({ success: true, message: 'New York licensing scraper completed' });
  } catch (error: any) {
    console.error('[NewYorkLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-oklahoma-licensing
router.post('/scraper/run-oklahoma-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runOklahomaLicensingScraper();
    res.json({ success: true, message: 'Oklahoma licensing scraper completed' });
  } catch (error: any) {
    console.error('[OklahomaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-oregon-licensing
router.post('/scraper/run-oregon-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runOregonLicensingScraper();
    res.json({ success: true, message: 'Oregon licensing scraper completed' });
  } catch (error: any) {
    console.error('[OregonLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-pennsylvania-licensing
router.post('/scraper/run-pennsylvania-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runPennsylvaniaLicensingScraper();
    res.json({ success: true, message: 'Pennsylvania licensing scraper completed' });
  } catch (error: any) {
    console.error('[PennsylvaniaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-rhode-island-licensing
router.post('/scraper/run-rhode-island-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runRhodeIslandLicensingScraper();
    res.json({ success: true, message: 'Rhode Island licensing scraper completed' });
  } catch (error: any) {
    console.error('[RhodeIslandLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-south-carolina-licensing
router.post('/scraper/run-south-carolina-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runSouthCarolinaLicensingScraper();
    res.json({ success: true, message: 'South Carolina licensing scraper completed' });
  } catch (error: any) {
    console.error('[SouthCarolinaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-south-dakota-licensing
router.post('/scraper/run-south-dakota-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runSouthDakotaLicensingScraper();
    res.json({ success: true, message: 'South Dakota licensing scraper completed' });
  } catch (error: any) {
    console.error('[SouthDakotaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-texas-licensing
router.post('/scraper/run-texas-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runTexasLicensingScraper();
    res.json({ success: true, message: 'Texas licensing scraper completed' });
  } catch (error: any) {
    console.error('[TexasLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-utah-licensing
router.post('/scraper/run-utah-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runUtahLicensingScraper();
    res.json({ success: true, message: 'Utah licensing scraper completed' });
  } catch (error: any) {
    console.error('[UtahLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-osm — run OpenStreetMap Overpass API scraper
router.post('/scraper/run-osm', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runOsmScraper();
    res.json({ success: true, message: 'OSM scraper completed' });
  } catch (error: any) {
    console.error('[OSM] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-sale-seeker — run TheSaleSeker.com scraper
router.post('/scraper/run-sale-seeker', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    // Get system organizer for unmanaged listings
    const { getOrCreateSystemOrganizer } = await import('../services/scraper/index');
    const organizerId = await getOrCreateSystemOrganizer();

    // Scrape all major metros (extract from query or use national default list)
    const metros = req.body?.metros || DEFAULT_METROS;

    const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

    for (const metro of metros) {
      try {
        const { defaultRateLimiter } = await import('../services/scraper/index');
        const result = await scrapeTheSaleSeker(metro, organizerId, defaultRateLimiter);
        stats.created += result.created;
        stats.updated += result.updated;
        stats.skipped += result.skipped;
        stats.failed += result.failed;
      } catch (err) {
        console.error(`[SaleSeker] Metro ${metro} failed:`, err);
        stats.failed++;
      }
    }

    res.json({ success: true, message: 'SaleSeker scraper completed', stats });
  } catch (error: any) {
    console.error('[SaleSeker] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-auctionzip — run AuctionZip auctioneer directory scraper (manual only)
// Body (optional): { "letters": ["A","B","C"] } to run a subset of letters
router.post('/scraper/run-auctionzip', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    const letters = Array.isArray(req.body?.letters) ? req.body.letters : undefined;
    await runAuctionZipScraper(letters);
    res.json({ success: true, message: 'AuctionZip scraper completed' });
  } catch (error: any) {
    console.error('[AuctionZip] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/enrich-sale-details — trigger ESN sale detail enrichment (description + photos)
router.post('/enrich-sale-details', triggerSaleDetailEnrichment);

// GET /api/internal/enrich-sale-details/status — check unenriched sales count
router.get('/enrich-sale-details/status', getSaleDetailEnrichmentStatus);

// GET /api/internal/enrich-sale-details/batch — get batch of unenriched sales (called by enrich-sale-details.yml workflow)
router.get('/enrich-sale-details/batch', getBatchOfUnenrichedSales);

// POST /api/internal/enrich-sale-details/bulk — bulk upsert enriched sale details (called by enrich-sale-details.yml workflow)
router.post('/enrich-sale-details/bulk', bulkUpsertEnrichedSales);

// POST /api/internal/category-sync/trigger — manually trigger eBay category sync (public eBay data, no auth required)
router.post('/category-sync/trigger', async (req: express.Request, res: express.Response) => {
  try {
    runCategorySync().catch(err => console.error('[CategorySync] Trigger error:', err));
    res.json({ ok: true, message: 'Category sync started' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/internal/outreach/trigger — manually trigger outreach email batch (protected)
router.post('/outreach/trigger', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await sendOutreachEmails();
    res.json({ ok: true, message: 'Outreach batch triggered' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/internal/scoring/run-backfill — score all organizers (protected)
// Note: long-running (~30s for 8k orgs). Guard headersSent in case client times out.
router.post('/scoring/run-backfill', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    const stats = await runLeadScoringBackfill();
    if (!res.headersSent) res.json({ ok: true, stats });
  } catch (err: any) {
    console.error('[LeadScoring] Backfill route error:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/internal/enrichment/run-website-backfill — enrich licensed organizers with no website (protected)
router.post('/enrichment/run-website-backfill', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    // Respond immediately — backfill is long-running
    res.status(202).json({ ok: true, message: 'Website enrichment backfill started' });
    runWebsiteEnrichmentBackfill().catch(err => console.error('[WebsiteEnrichment] Backfill route error:', err));
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

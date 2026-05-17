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
  try {
    await runIndianaLicensingScraper();
    res.json({ success: true, message: 'Indiana licensing scraper completed' });
  } catch (error: any) {
    console.error('[IndianaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-illinois-licensing
router.post('/scraper/run-illinois-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runIllinoisLicensingScraper();
    res.json({ success: true, message: 'Illinois licensing scraper completed' });
  } catch (error: any) {
    console.error('[IllinoisLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-louisiana-licensing
router.post('/scraper/run-louisiana-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runLouisianaLicensingScraper();
    res.json({ success: true, message: 'Louisiana licensing scraper completed' });
  } catch (error: any) {
    console.error('[LouisianaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-north-carolina-licensing
router.post('/scraper/run-north-carolina-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runNorthCarolinaLicensingScraper();
    res.json({ success: true, message: 'North Carolina licensing scraper completed' });
  } catch (error: any) {
    console.error('[NorthCarolinaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-virginia-licensing
router.post('/scraper/run-virginia-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runVirginiaLicensingScraper();
    res.json({ success: true, message: 'Virginia licensing scraper completed' });
  } catch (error: any) {
    console.error('[VirginiaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-missouri-licensing
router.post('/scraper/run-missouri-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runMissouriLicensingScraper();
    res.json({ success: true, message: 'Missouri licensing scraper completed' });
  } catch (error: any) {
    console.error('[MissouriLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-ohio-licensing
router.post('/scraper/run-ohio-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runOhioLicensingScraper();
    res.json({ success: true, message: 'Ohio licensing scraper completed' });
  } catch (error: any) {
    console.error('[OhioLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-tennessee-licensing
router.post('/scraper/run-tennessee-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runTennesseeLicensingScraper();
    res.json({ success: true, message: 'Tennessee licensing scraper completed' });
  } catch (error: any) {
    console.error('[TennesseeLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-vermont-licensing
router.post('/scraper/run-vermont-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runVermontLicensingScraper();
    res.json({ success: true, message: 'Vermont licensing scraper completed' });
  } catch (error: any) {
    console.error('[VermontLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-washington-licensing
router.post('/scraper/run-washington-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runWashingtonLicensingScraper();
    res.json({ success: true, message: 'Washington licensing scraper completed' });
  } catch (error: any) {
    console.error('[WashingtonLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-wisconsin-licensing
router.post('/scraper/run-wisconsin-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runWisconsinLicensingScraper();
    res.json({ success: true, message: 'Wisconsin licensing scraper completed' });
  } catch (error: any) {
    console.error('[WisconsinLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-west-virginia-licensing
router.post('/scraper/run-west-virginia-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runWestVirginiaLicensingScraper();
    res.json({ success: true, message: 'West Virginia licensing scraper completed' });
  } catch (error: any) {
    console.error('[WestVirginiaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-wyoming-licensing
router.post('/scraper/run-wyoming-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runWyomingLicensingScraper();
    res.json({ success: true, message: 'Wyoming licensing scraper completed' });
  } catch (error: any) {
    console.error('[WyomingLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-alaska-licensing
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

// POST /api/internal/scraper/run-osm
router.post('/scraper/run-osm', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runOsmScraper();
    res.json({ success: true, message: 'OSM scraper completed' });
  } catch (error: any) {
    console.error('[OSM] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-sale-seeker
router.post('/scraper/run-sale-seeker', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    const { getOrCreateSystemOrganizer } = await import('../services/scraper/index');
    const organizerId = await getOrCreateSystemOrganizer();
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

// POST /api/internal/scraper/run-garagesalefinder
router.post('/scraper/run-garagesalefinder', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    const { getOrCreateSystemOrganizer, defaultRateLimiter } = await import('../services/scraper/index');
    const organizerId = await getOrCreateSystemOrganizer();
    const metros: string[] = req.body?.metros || DEFAULT_METROS;
    const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };
    for (const metro of metros) {
      try {
        const result = await scrapeGarageSaleFinder(metro, organizerId, defaultRateLimiter);
        stats.created += result.created;
        stats.updated += result.updated;
        stats.skipped += result.skipped;
        stats.failed += result.failed;
      } catch (err) {
        console.error(`[GarageSaleFinder] Metro ${metro} failed:`, err);
        stats.failed++;
      }
    }
    res.json({ success: true, message: 'GarageSaleFinder scraper completed', stats });
  } catch (error: any) {
    console.error('[GarageSaleFinder] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-auctionzip
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

// POST /api/internal/scraper/run-auction-ninja
router.post('/scraper/run-auction-ninja', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await scrapeAuctionNinja();
    res.json({ success: true, message: 'AuctionNinja scraper completed' });
  } catch (error: any) {
    console.error('[AuctionNinja] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-naa
router.post('/scraper/run-naa', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await scrapeNAADirectory();
    res.json({ success: true, message: 'NAA scraper completed' });
  } catch (error: any) {
    console.error('[NAA] Route error:', error);
    res.status(500).json({ error: error.message });
  }
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
  try {
    const stats = await runLeadScoringBackfill();
    if (!res.headersSent) res.json({ ok: true, stats });
  } catch (err: any) {
    console.error('[LeadScoring] Backfill route error:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/internal/enrichment/run-website-backfill
router.post('/enrichment/run-website-backfill', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    res.status(202).json({ ok: true, message: 'Website enrichment backfill started' });
    runWebsiteEnrichmentBackfill().catch(err => console.error('[WebsiteEnrichment] Backfill route error:', err));
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Phase 2 scrapers
router.post('/scraper/run-alaska-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runAlaskaPhase2Scraper(); res.json({ success: true, message: 'Alaska Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-arizona-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runArizonaPhase2Scraper(); res.json({ success: true, message: 'Arizona Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-california-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runCaliforniaPhase2Scraper(); res.json({ success: true, message: 'California Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-colorado-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runColoradoPhase2Scraper(); res.json({ success: true, message: 'Colorado Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-connecticut-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runConnecticutPhase2Scraper(); res.json({ success: true, message: 'Connecticut Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-delaware-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runDelawarePhase2Scraper(); res.json({ success: true, message: 'Delaware Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-hawaii-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runHawaiiPhase2Scraper(); res.json({ success: true, message: 'Hawaii Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-idaho-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runIdahoPhase2Scraper(); res.json({ success: true, message: 'Idaho Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-illinois-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runIllinoisPhase2Scraper(); res.json({ success: true, message: 'Illinois Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-kansas-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runKansasPhase2Scraper(); res.json({ success: true, message: 'Kansas Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-michigan-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runMichiganPhase2Scraper(); res.json({ success: true, message: 'Michigan Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-minnesota-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runMinnesotaPhase2Scraper(); res.json({ success: true, message: 'Minnesota Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-missouri-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runMissouriPhase2Scraper(); res.json({ success: true, message: 'Missouri Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-montana-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runMontanaPhase2Scraper(); res.json({ success: true, message: 'Montana Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-nebraska-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runNebraskaPhase2Scraper(); res.json({ success: true, message: 'Nebraska Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-nevada-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runNevadaPhase2Scraper(); res.json({ success: true, message: 'Nevada Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-new-jersey-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runNewJerseyPhase2Scraper(); res.json({ success: true, message: 'New Jersey Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-new-mexico-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runNewMexicoPhase2Scraper(); res.json({ success: true, message: 'New Mexico Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-new-york-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runNewYorkPhase2Scraper(); res.json({ success: true, message: 'New York Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-oklahoma-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runOklahomaphase2Scraper(); res.json({ success: true, message: 'Oklahoma Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-oregon-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runOregonPhase2Scraper(); res.json({ success: true, message: 'Oregon Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-pennsylvania-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runPennsylvaniaPhase2Scraper(); res.json({ success: true, message: 'Pennsylvania Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-rhode-island-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runRhodeIslandPhase2Scraper(); res.json({ success: true, message: 'Rhode Island Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-texas-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runTexasPhase2Scraper(); res.json({ success: true, message: 'Texas Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-utah-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runUtahPhase2Scraper(); res.json({ success: true, message: 'Utah Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-virginia-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runVirginiaPhase2Scraper(); res.json({ success: true, message: 'Virginia Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-washington-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runWashingtonPhase2Scraper(); res.json({ success: true, message: 'Washington Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-wyoming-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runWyomingPhase2Scraper(); res.json({ success: true, message: 'Wyoming Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-florida-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runFloridaPhase2Scraper(); res.json({ success: true, message: 'Florida Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-georgia-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runGeorgiaPhase2Scraper(); res.json({ success: true, message: 'Georgia Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-north-carolina-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runNorthCarolinaPhase2Scraper(); res.json({ success: true, message: 'North Carolina Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-ohio-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runOhioPhase2Scraper(); res.json({ success: true, message: 'Ohio Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-canada411', requireSecret, async (req: express.Request, res: express.Response) => { try { await runCanada411Scraper(); res.json({ success: true, message: 'Canada411 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-yellowpages-ca', requireSecret, async (req: express.Request, res: express.Response) => { try { await runYellowPagesCaScraper(); res.json({ success: true, message: 'YellowPages.ca scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-alabama-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runAlabamaPhase2Scraper(); res.json({ success: true, message: 'Alabama Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-kentucky-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runKentuckyPhase2Scraper(); res.json({ success: true, message: 'Kentucky Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-maine-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runMainePhase2Scraper(); res.json({ success: true, message: 'Maine Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-iowa-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runIowaPhase2Scraper(); res.json({ success: true, message: 'Iowa Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-wisconsin-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runWisconsinPhase2Scraper(); res.json({ success: true, message: 'Wisconsin Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-louisiana-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runLouisianaPhase2Scraper(); res.json({ success: true, message: 'Louisiana Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-arkansas-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runArkansasPhase2Scraper(); res.json({ success: true, message: 'Arkansas Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-mississippi-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runMississippiPhase2Scraper(); res.json({ success: true, message: 'Mississippi Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-south-carolina-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runSouthCarolinaPhase2Scraper(); res.json({ success: true, message: 'South Carolina Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-indiana-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runIndianaPhase2Scraper(); res.json({ success: true, message: 'Indiana Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-maryland-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runMarylandPhase2Scraper(); res.json({ success: true, message: 'Maryland Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-massachusetts-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runMassachusettsPhase2Scraper(); res.json({ success: true, message: 'Massachusetts Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-new-hampshire-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runNewHampshirePhase2Scraper(); res.json({ success: true, message: 'New Hampshire Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-north-dakota-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runNorthDakotaPhase2Scraper(); res.json({ success: true, message: 'North Dakota Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-south-dakota-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runSouthDakotaPhase2Scraper(); res.json({ success: true, message: 'South Dakota Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-tennessee-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runTennesseePhase2Scraper(); res.json({ success: true, message: 'Tennessee Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-vermont-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runVermontPhase2Scraper(); res.json({ success: true, message: 'Vermont Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-west-virginia-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runWestVirginiaPhase2Scraper(); res.json({ success: true, message: 'West Virginia Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });
router.post('/scraper/run-virginia-general-phase2', requireSecret, async (req: express.Request, res: express.Response) => { try { await runVirginiaGeneralPhase2Scraper(); res.json({ success: true, message: 'Virginia General Phase 2 scraper completed' }); } catch (error: any) { res.status(500).json({ error: error.message }); } });


// POST /api/internal/enrich-listing-metadata — batch AI enrichment for scraped sales (GitHub Actions daily)
router.post('/enrich-listing-metadata', requireSecret, runListingEnrichmentBatch);

// POST /api/internal/backfill-organizer-contacts — free backfill: propagate contact data from scraped sales to organizers (GitHub Actions daily)
router.post('/backfill-organizer-contacts', requireSecret, runOrganizerContactBackfill);

// POST /api/internal/jobs/run — single dispatcher for background pipeline jobs (GitHub Actions cron)
router.post('/jobs/run', requireSecret, runInternalJob);

export default router;

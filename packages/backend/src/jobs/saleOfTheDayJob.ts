/**
 * saleOfTheDayJob.ts — Feature #401: Sale of the Day nightly selection cron
 *
 * Runs at midnight UTC daily. Calls selectSaleOfTheDay() and logs the result
 * so Railway logs provide visibility into which sale was chosen each day.
 */

import cron from 'node-cron';
import { selectSaleOfTheDay } from '../services/saleOfTheDayService';
import { cronGuard } from '../utils/cronGuard';

// 0 0 * * * — midnight UTC, daily
cron.schedule('0 0 * * *', cronGuard({ jobName: 'saleOfTheDayJob' }, async () => {
  console.log('[saleOfTheDayJob] Selecting sale of the day...');
  const sale = await selectSaleOfTheDay();
  if (sale) {
    console.log(
      `[saleOfTheDayJob] Selected: "${sale.title}" in ${sale.city}, ${sale.state} ` +
      `(${sale.itemCount} items, starts ${sale.startDate})`
    );
  } else {
    console.log('[saleOfTheDayJob] No qualifying sale found for tomorrow.');
  }
}));

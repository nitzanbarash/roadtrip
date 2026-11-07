// Open rental-car search pages in Chrome and print the page text (prices). If a site shows a bot check, we just note it.
const { chromium } = require('playwright');
const D1 = '2026-12-01', D2 = '2027-02-08';
const sites = [
  ['kayak', `https://www.kayak.com/cars/EWR/PHX/${D1}/${D2}?sort=price_a`],
  ['kayak-nyc', `https://www.kayak.com/cars/New-York,NY-c15830/Phoenix,AZ-c11908/${D1}/${D2}?sort=price_a`],
  ['kayak-phl', `https://www.kayak.com/cars/PHL/PHX/${D1}/${D2}?sort=price_a`],
  ['expedia', `https://www.expedia.com/carsearch?locn=EWR&loc2=PHX&date1=12%2F1%2F2026&date2=2%2F8%2F2027&time1=1000AM&time2=1000AM`],
  ['priceline', `https://www.priceline.com/drive/search/r/listings/EWR/PHX/20261201-10:00/20270208-10:00/list`],
];
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [name, url] of sites) {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'en-US' });
    const p = await ctx.newPage();
    console.log('\n########## ' + name);
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(35000);
      console.log('URL', p.url(), '| TITLE', await p.title());
      const t = (await p.evaluate(() => document.body ? document.body.innerText : '')).replace(/\n\s*\n+/g, '\n');
      console.log(t.slice(0, 7000));
    } catch (e) { console.log('ERR', e.message.split('\n')[0]); }
    await ctx.close();
  }
  await b.close();
})();

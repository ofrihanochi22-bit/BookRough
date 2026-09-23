### Phase 0: Why This Approach, and What It Costs

This service exists because the obvious alternative does not work. The **Odesli / Songlink API** was the original plan and was rejected: the service has been degraded for several months and no longer returns links for most platforms, which defeats the purpose of the feature. Scraping squigly.link with a headless browser is less elegant, slower, and more fragile — and it is the approach that actually produces working links today.

Three consequences follow, and they are binding on everything below.

**1. Latency.** Driving a real browser against a live site takes **3–8 seconds**. This cannot be optimised away; it is the cost of the approach. The original product requirement of "conversion under 2 seconds" was written for the API approach and is void. The replacement budget is **p95 under 10 seconds, hard ceiling 12 seconds**, after which the attempt is abandoned.

**2. The posting flow is synchronous and blocking.** The user presses Submit, sees a spinner with explanatory copy ("Finding this track on other services…"), and the post is born complete. We deliberately do **not** publish optimistically and fill in the links via a background job and polling: the extra machinery — job state, polling or websockets, a half-rendered post in the feed — is not worth it at this scale. Because the wait is long and visible, the spinner is a designed state, not an afterthought.

**3. Fragility is permanent.** squigly.link is an unversioned dependency with no contract. A layout change on their side breaks the core feature without any change to our code. Two mitigations are mandatory: the graceful-failure path below, and keeping every selector confined to this one service file so that a break is a small, local fix rather than an investigation.

### Phase 1: Project Setup

First, you need to install Playwright into your existing Node.js backend repository.
- **Install the Playwright package:** Run this in your backend directory:
Bash
npm install playwright
- **Install the browser binaries:** Playwright needs to download the actual browser engines (Chromium, Firefox, WebKit) to run headless. Since we just need one to scrape, Chromium is the standard choice.
Bash
npx playwright install chromium

### Phase 2: The Scraping Utility (TypeScript)

Create a dedicated service file for this logic to keep your architecture clean (e.g., services/linkScraper.service.ts).
Important Note: The CSS selectors used below (#url-input, #convert-btn, .link-result) are placeholders. You will need to inspect the live squigly.link site using your browser's DevTools to find the exact class names or IDs they use.
TypeScript
import { chromium, Browser, Page } from 'playwright';

// Define the shape of the data you want to return
export interface UniversalLinks {
spotify?: string;
appleMusic?: string;
youtube?: string;
tidal?: string;
originalUrl: string;
}

export async function generateUniversalLinks(sourceUrl: string): Promise<UniversalLinks> {
let browser: Browser | null = null;

try {
// 1. Launch a headless Chromium instance
browser = await chromium.launch({
headless: true,
// Useful flags to reduce memory footprint on cheap servers
args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const page: Page = await browser.newPage();

// Optional: Block images and CSS to speed up loading and save memory
await page.route('**/*', (route) => {
const requestType = route.request().resourceType();
if (['image', 'stylesheet', 'font', 'media'].includes(requestType)) {
route.abort();
} else {
route.continue();
}
});

// 2. Navigate to the conversion site
await page.goto('https://squigly.link', { waitUntil: 'domcontentloaded' });

// 3. Interact with the page (USE ACTUAL SELECTORS FROM THE SITE)
await page.fill('input[placeholder="Paste your link here"]', sourceUrl); // Example selector
await page.click('button:has-text("Convert")'); // Example selector

// 4. Wait for the results to render in the DOM
// This is crucial. Playwright needs to wait until the specific element appears.
await page.waitForSelector('.results-container', { timeout: 8000 });

// 5. Scrape the data from the page context
const links = await page.evaluate(() => {
// This code runs INSIDE the headless browser
const resultData: Partial<UniversalLinks> = {};

// Example logic: Find all output links and map them
// You must adapt this to exactly how squigly.link structures its HTML
const linkElements = document.querySelectorAll('.platform-link');

linkElements.forEach((el) => {
const platformName = el.getAttribute('data-platform'); // e.g., 'spotify'
const url = el.getAttribute('href');

if (platformName && url) {
if (platformName.includes('spotify')) resultData.spotify = url;
if (platformName.includes('apple')) resultData.appleMusic = url;
if (platformName.includes('youtube')) resultData.youtube = url;
}
});

return resultData;
});

return {
...links,
originalUrl: sourceUrl
};

} catch (error) {
// Use the Pino logger, not console.error — console.* is banned in committed code.
logger.error({ context: 'linkScraper', sourceUrl, err: error }, 'Failed to scrape links');
throw new AppError("Link conversion failed. The service might be down or the site structure changed.", 502);
} finally {
// 6. ALWAYS close the browser to prevent memory leaks
if (browser) {
await browser.close();
}
}
}

### Phase 3: Integration with Your API endpoint

Now, integrate this service into your backend route where users submit a new Post.
TypeScript
import express, { Request, Response } from 'express';
import { generateUniversalLinks } from '../services/linkScraper.service';
// import your DB models here...

const router = express.Router();

router.post('/api/communities/:id/posts', async (req: Request, res: Response) => {
const { url, comment } = req.body;
const communityId = req.params.id;
const userId = req.user.id; // Assuming you have auth middleware

try {
// 1. Acknowledge the request or let the frontend know it's processing
// (If using WebSockets, you'd send a "processing" event here)

// 2. Call the Playwright scraper
const universalLinks = await generateUniversalLinks(url);

// 3. Save to your database
/*
const newPost = await Post.create({
authorId: userId,
communityId: communityId,
comment: comment,
externalLinks: universalLinks,
// ... metadata fetching logic ...
});
*/

return res.status(201).json({ message: "Post created!", data: universalLinks /* or newPost */ });

} catch (error) {
return res.status(500).json({ error: "Could not process the music link." });
}
});

### Phase 4: Dockerization (Crucial Step)

Because Playwright requires underlying OS libraries (like libnss3, libasound2) to run Chromium, you cannot easily deploy this to standard lightweight Node environments without a custom Dockerfile.
Here is a Dockerfile utilizing Playwright's official image, which comes pre-loaded with all the necessary system dependencies.
Dockerfile

# Use the official Playwright image as the base

FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Set the working directory

WORKDIR /app

# Copy package files

COPY package*.json ./

# Install dependencies

RUN npm install

# Copy the rest of your backend code

COPY . .

# Build your TypeScript code (if applicable)

RUN npm run build

# Expose your API port

EXPOSE 3000

# Start the server

CMD ["npm", "start"]

### Key Resiliency Practices

These are requirements, not suggestions.

- **Fail Gracefully:** If squigly.link goes down or changes its HTML structure, page.waitForSelector() will time out and throw. Catch it and **save the user's post anyway**, with the original link and a `conversion_pending` flag. The user sees their post with a quiet "other services unavailable" note — not an error dialog, and never a lost draft. Losing someone's content because a third-party site changed a CSS class is the worst possible outcome here.
- **Concurrency Limits:** Running headless browsers uses significant RAM. If several friends post at the same moment, an unbounded implementation opens a Chromium instance per request and exhausts the server's memory. **Wrap the scrape in `p-limit(2)`** — two concurrent conversions maximum, with further requests queueing. This is mandatory, not a future optimisation, because the deployment target is a small or free-tier instance where the memory ceiling is genuinely close. If the chosen tier turns out to be tighter still, lower the cap to 1 before reaching for anything more elaborate.
- **Timeouts:** Always enforce strict timeouts. Playwright defaults to 30 seconds for many actions, which would hang the request well past the point the user has given up. Set `waitForSelector` to **8 seconds** and enforce an overall **12-second ceiling** on the whole operation, after which the graceful-failure path above takes over.
- **Always close the browser in `finally`.** A leaked Chromium process on a memory-constrained instance is fatal within a few requests. This is the single most common way this kind of service fails in production.
- **Never log the raw scraped HTML** at INFO level. It is large, it pollutes the logs, and it can contain the user's original URL in contexts where that is not wanted. Log the outcome and the duration.

### Testing This Service

- **Unit and integration tests must never launch a real browser.** Mock `generateUniversalLinks` so it returns fixed links instantly. A test suite that boots Chromium is slow, flaky, and dependent on a third-party site being up — which means it will eventually be ignored.
- Test the **failure path explicitly**: assert that when the scraper throws, the post is still created, `conversion_pending` is set, and the endpoint returns success rather than an error.
- Test that the **concurrency cap holds**: with the limiter in place, a burst of simultaneous requests must not exceed two in flight.
- Real browser interaction belongs only in the Playwright E2E suite, which runs post-merge and nightly rather than on every pull request. The nightly run is specifically what will detect a squigly.link layout change, since that breaks the feature without any commit of ours.


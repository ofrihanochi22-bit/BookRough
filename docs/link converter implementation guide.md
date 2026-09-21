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
console.error("Failed to scrape links:", error);
throw new Error("Link conversion failed. The service might be down or the site structure changed.");
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

- **Fail Gracefully:** If squigly.link goes down or changes its HTML structure, your page.waitForSelector() will timeout and throw an error. Catch this error and save the user's post anyway, but perhaps flag it in the database as "Conversion Pending" or simply store the original link so the post isn't entirely lost.
- **Concurrency Limits:** Running headless browsers uses significant RAM. If 10 friends post a link at the exact same second, your server will attempt to open 10 Chromium instances and crash. For a small group, this is unlikely, but if it happens, look into using a package like p-limit or setting up a simple Redis queue to ensure the server only processes 1 or 2 links at a time.
- **Timeouts:** Always enforce strict timeouts. Playwright defaults to 30 seconds for many actions. You should lower this (e.g., to 8-10 seconds) so your API doesn't hang indefinitely if the target site is slow to load.


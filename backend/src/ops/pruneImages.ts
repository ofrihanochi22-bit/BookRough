/**
 * Keeps the Vercel Container Registry at the 4 newest backend images
 * (docs/features/production-hardening.md §3.8, deployment-storage.md §1.2).
 *
 * Run by main.yml's prune-images job with Node's own type stripping
 * (`node backend/src/ops/pruneImages.ts`), so it uses no package and no syntax
 * beyond erasable types. It talks to Vercel's REST API with fetch: the image
 * list is documented JSON, where the CLI's output is not.
 *
 * It lists and decides on every run, and deletes only when PRUNE_IMAGES is
 * "delete". Until the developer sets that repository variable, every run is a
 * dry run whose plan can be read in the job log first.
 */

import { pathToFileURL } from 'node:url';

export interface RegistryImage {
  id: string;
  createdAt: string;
  tags: string[];
  sizeInBytes?: number | string | undefined;
}

export interface PrunePlan {
  keep: RegistryImage[];
  remove: RegistryImage[];
  /** Untagged entries can be the platform manifests of a kept image: never touched. */
  untagged: number;
}

export interface PruneOptions {
  keep: number;
  currentSha: string;
  maxDeletes: number;
}

/** A tag names the commit if it is the SHA or a prefix of it at least 7 long. */
function namesCommit(tag: string, sha: string): boolean {
  return tag === sha || (tag.length >= 7 && sha.startsWith(tag));
}

/**
 * Decides what to delete; pure, so every guard is a unit test. Throws rather
 * than guessing whenever the listing looks wrong.
 */
export function planPrune(images: RegistryImage[], options: PruneOptions): PrunePlan {
  const tagged = images.filter((image) => image.tags.length > 0);
  const untagged = images.length - tagged.length;

  for (const image of tagged) {
    if (Number.isNaN(Date.parse(image.createdAt))) {
      throw new Error(`Image ${image.id} has an unreadable createdAt; deleting nothing.`);
    }
  }

  const newestFirst = [...tagged].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const keep = newestFirst.slice(0, options.keep);
  const remove = newestFirst
    .slice(options.keep)
    .filter((image) => !image.tags.some((tag) => namesCommit(tag, options.currentSha)));
  // The current commit's image is always kept, even when it is not among the newest.
  keep.push(...newestFirst.slice(options.keep).filter((image) => !remove.includes(image)));

  if (remove.length > options.maxDeletes) {
    throw new Error(
      `Refusing to delete ${remove.length} images in one run (limit ${options.maxDeletes}); ` +
        'delete them in the Images tab, or check the listing.',
    );
  }
  return { keep, remove, untagged };
}

interface Config {
  token: string;
  team: string;
  project: string;
  repository: string;
  currentSha: string;
  deleting: boolean;
}

const API = 'https://api.vercel.com/v1/vcr/repository';
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

function query(config: Config, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ projectId: config.project, slug: config.team, ...extra }).toString();
}

async function listImages(config: Config): Promise<RegistryImage[]> {
  const images: RegistryImage[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = query(config, { limit: String(PAGE_LIMIT), ...(cursor ? { cursor } : {}) });
    const response = await fetch(
      `${API}/${encodeURIComponent(config.repository)}/images?${params}`,
      {
        headers: { Authorization: `Bearer ${config.token}` },
      },
    );
    if (!response.ok) {
      throw new Error(`Listing images failed with HTTP ${response.status}; deleting nothing.`);
    }
    const body = (await response.json()) as { images?: unknown; nextCursor?: unknown };
    if (!Array.isArray(body.images)) {
      throw new Error('The image list has an unexpected shape; deleting nothing.');
    }
    for (const raw of body.images as Record<string, unknown>[]) {
      if (
        typeof raw.id !== 'string' ||
        typeof raw.createdAt !== 'string' ||
        !Array.isArray(raw.tags)
      ) {
        throw new Error('An image in the list has an unexpected shape; deleting nothing.');
      }
      images.push({
        id: raw.id,
        createdAt: raw.createdAt,
        tags: raw.tags.filter((tag): tag is string => typeof tag === 'string'),
        sizeInBytes: raw.sizeInBytes as number | string | undefined,
      });
    }
    if (typeof body.nextCursor !== 'string' || body.nextCursor === '') {
      return images;
    }
    cursor = body.nextCursor;
  }
  throw new Error(`More than ${MAX_PAGES} pages of images; deleting nothing.`);
}

async function deleteImage(config: Config, image: RegistryImage): Promise<void> {
  const url = `${API}/${encodeURIComponent(config.repository)}/images/${encodeURIComponent(image.id)}?${query(config)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (response.status !== 202 && response.status !== 404 && response.status !== 410) {
    throw new Error(`Deleting ${image.id} failed with HTTP ${response.status}.`);
  }
}

function describe(image: RegistryImage): string {
  const megabytes = Math.round(Number(image.sizeInBytes ?? 0) / 1_000_000);
  return `${image.id}  ${image.createdAt}  ${image.tags.join(',')}  ${megabytes} MB`;
}

function readConfig(source: NodeJS.ProcessEnv): Config {
  const required = (name: string): string => {
    const value = source[name]?.trim();
    if (!value) {
      throw new Error(`${name} is not set.`);
    }
    return value;
  };
  return {
    token: required('VERCEL_TOKEN'),
    team: required('VERCEL_TEAM'),
    project: source.VERCEL_PROJECT?.trim() || 'bookrough',
    repository: source.VCR_REPOSITORY?.trim() || 'api',
    currentSha: required('CURRENT_SHA'),
    deleting: source.PRUNE_IMAGES === 'delete',
  };
}

/* v8 ignore start -- the network half; planPrune holds every decision and is tested. */
export async function main(source: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = readConfig(source);
  const plan = planPrune(await listImages(config), {
    keep: 4,
    currentSha: config.currentSha,
    maxDeletes: 10,
  });

  process.stdout.write(`Keeping ${plan.keep.length}:\n${plan.keep.map(describe).join('\n')}\n`);
  process.stdout.write(`Untagged, never touched: ${plan.untagged}\n`);
  process.stdout.write(
    `${config.deleting ? 'Deleting' : 'Would delete (dry run)'} ${plan.remove.length}:\n` +
      `${plan.remove.map(describe).join('\n')}\n`,
  );

  if (!config.deleting) {
    return;
  }
  for (const image of plan.remove) {
    await deleteImage(config, image);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}
/* v8 ignore stop */

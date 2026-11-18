import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { isAxiosError } from 'axios';

import { fetchAdminOverview, type AdminOverview, type OverviewStatus } from '../api/admin';
import { Button } from '../components/ui/Button';
import { LoadError } from '../components/ui/LoadError';
import { LoadingHint } from '../components/ui/LoadingHint';
import { Skeleton } from '../components/ui/Skeleton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  SOURCE_LABEL,
  STATUS_LABEL,
  ageLabel,
  changeLabel,
  formatBytes,
  formatClock,
  formatDateTime,
  formatDay,
  formatShortDate,
  percentLabel,
  shortSha,
  verdictLabel,
} from '../lib/overviewCopy';
import { useAuthStore } from '../stores/auth';
import { NotFound } from './NotFound';

/**
 * Admin → Overview — docs/features/admin-overview.md §5. Read-only: its one
 * control is Refresh, which re-reads what is stored and never triggers a
 * scrape. Every block says where its data came from and how old it is.
 */

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: AdminOverview; refreshing: boolean; refreshError: boolean };

const CARD = 'rounded-[22px] bg-surface p-4';
const LIST = 'flex flex-col divide-y divide-line';
const ROW = 'flex items-start justify-between gap-3 py-2.5 text-sm';

const CHIP_LOOK: Record<OverviewStatus, string> = {
  ok: 'border border-line text-muted',
  watch: 'bg-sticker text-sticker-ink',
  stop: 'bg-danger-soft text-danger',
};

const BAR_LOOK: Record<OverviewStatus, string> = {
  ok: 'bg-accent',
  watch: 'bg-sticker',
  stop: 'bg-danger',
};

function isForbidden(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

export function AdminOverviewTab() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [announce, setAnnounce] = useState('');
  const online = useOnlineStatus();

  const fetchInto = useCallback(async (refresh: boolean) => {
    try {
      const data = await fetchAdminOverview();
      setLoad({ status: 'ready', data, refreshing: false, refreshError: false });
      if (refresh) setAnnounce('Overview updated');
    } catch (error) {
      setLoad((current) =>
        refresh && current.status === 'ready' && !isForbidden(error)
          ? { ...current, refreshing: false, refreshError: true }
          : { status: 'error', error },
      );
      if (refresh) setAnnounce("Couldn't refresh the overview.");
    }
  }, []);

  useEffect(() => {
    void fetchInto(false);
  }, [fetchInto]);

  const forbidden = load.status === 'error' && isForbidden(load.error);
  useEffect(() => {
    if (forbidden) useAuthStore.getState().revokeAdmin();
  }, [forbidden]);

  if (forbidden) {
    return <NotFound />;
  }
  if (load.status === 'loading') {
    return (
      <div role="status" aria-label="Loading the overview" className="flex flex-col gap-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
        <LoadingHint />
      </div>
    );
  }
  if (load.status === 'error') {
    return (
      <LoadError
        message="Couldn't load the overview."
        onRetry={() => {
          setLoad({ status: 'loading' });
          void fetchInto(false);
        }}
      />
    );
  }

  const { data, refreshing, refreshError } = load;
  const now = new Date(data.generatedAt);

  function refresh() {
    setAnnounce('');
    setLoad((current) =>
      current.status === 'ready' ? { ...current, refreshing: true, refreshError: false } : current,
    );
    void fetchInto(true);
  }

  return (
    <section aria-label="Overview" className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Updated {formatClock(data.generatedAt)}</p>
        <Button variant="secondary" busy={refreshing} offline={!online} onClick={refresh}>
          Refresh
        </Button>
      </div>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {!online && (
        <p role="status" className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
          You&apos;re offline. Showing the last loaded copy.
        </p>
      )}
      {refreshError && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Couldn&apos;t refresh. The figures below are from {formatClock(data.generatedAt)}.
        </p>
      )}

      <StorageBlock data={data} now={now} />
      <DeploymentsBlock data={data} now={now} />
      <ImagesBlock data={data} now={now} />
      <DeletionsBlock data={data} />
      <AppBlock data={data} />
    </section>
  );
}

function Block({
  title,
  source,
  children,
}: {
  title: string;
  source: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={CARD}>
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mb-3 text-xs text-muted">{source}</div>
      {children}
    </section>
  );
}

const LIVE = <span>Live</span>;

/** "From /vercel-usage · 3 hours ago", with Stale and its guidance when old. */
function SnapshotSource({
  tool,
  capturedAt,
  stale,
  now,
  rerun,
}: {
  tool: string;
  capturedAt: string;
  stale: boolean;
  now: Date;
  rerun: string;
}) {
  return (
    <>
      <span>
        From {tool} · {ageLabel(capturedAt, now)}
      </span>
      {stale && (
        <>
          {' '}
          <span className="rounded-full bg-sticker px-2 py-0.5 font-medium text-sticker-ink">
            Stale
          </span>
          <span className="mt-1 block">
            Last reading {ageLabel(capturedAt, now)}. {rerun}
          </span>
        </>
      )}
    </>
  );
}

function StatusChip({ status }: { status: OverviewStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_LOOK[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

interface MeterRow {
  name: string;
  used: string;
  limit: string;
  pct: number;
  status: OverviewStatus;
  change: string | null;
  note?: string;
}

const STATUS_ORDER: Record<OverviewStatus, number> = { stop: 0, watch: 1, ok: 2 };

function StorageBlock({ data, now }: { data: AdminOverview; now: Date }) {
  const usage = data.vercel.usage;
  const db = data.database;
  const rows: MeterRow[] = [];
  if (usage) {
    const names = {
      images: 'Vercel Images Storage',
      functions: 'Vercel Functions Storage',
      deployment: 'Vercel Deployment Storage',
    } as const;
    for (const key of ['images', 'functions', 'deployment'] as const) {
      const meter = usage.storage[key];
      rows.push({
        name: names[key],
        used: formatBytes(meter.usedBytes),
        limit: formatBytes(meter.limitBytes),
        pct: meter.pct,
        status: meter.status,
        change: changeLabel(meter.changeBytes),
      });
    }
  }
  rows.push({
    name: 'Neon database',
    used: formatBytes(db.usedBytes, 'binary'),
    limit: formatBytes(db.limitBytes, 'binary'),
    pct: db.pct,
    status: db.status,
    change: null,
    note: 'Approximate: measured from inside the database.',
  });
  // A Stop row first, then Watch; the order is otherwise kept.
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status] || a.index - b.index)
    .map(({ row }) => row);

  return (
    <Block
      title="Storage limits"
      source={
        usage ? (
          <>
            <SnapshotSource
              tool={SOURCE_LABEL.usage}
              capturedAt={usage.capturedAt}
              stale={usage.stale}
              now={now}
              rerun="Run /vercel-usage to update."
            />
            <span className="block">Neon database: Live</span>
          </>
        ) : (
          <span>Neon database: Live</span>
        )
      }
    >
      {!usage && (
        <p className="mb-2 text-sm text-muted">
          No Vercel reading yet. Run /vercel-usage after the next merge.
        </p>
      )}
      <ul className={LIST}>
        {sorted.map((row) => (
          <li key={row.name} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{row.name}</span>
              <StatusChip status={row.status} />
            </div>
            <div
              role="meter"
              aria-label={row.name}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, row.pct)}
              aria-valuetext={`${row.used} of ${row.limit}, ${percentLabel(row.pct)}`}
              className="h-2 overflow-hidden rounded-full bg-skeleton"
            >
              <div
                className={`h-full ${BAR_LOOK[row.status]}`}
                style={{ width: `${Math.min(100, row.pct)}%` }}
              />
            </div>
            <p className="text-xs text-muted">
              {row.used} of {row.limit} · {percentLabel(row.pct)}
              {row.change && ` · ${row.change}`}
            </p>
            {row.note && <p className="text-xs text-muted">{row.note}</p>}
          </li>
        ))}
        {usage?.others.map((meter) => (
          <li key={meter.name} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>
              Vercel {meter.name} · {percentLabel(meter.pct)}
            </span>
            <StatusChip status={meter.status} />
          </li>
        ))}
      </ul>
    </Block>
  );
}

function DeploymentsBlock({ data, now }: { data: AdminOverview; now: Date }) {
  const deployments = data.vercel.deployments;
  if (!deployments) {
    return (
      <Block title="Deployments" source={<span>From {SOURCE_LABEL.deployments}</span>}>
        <p className="text-sm text-muted">
          No reading yet. The prune-deployments job posts one after each run.
        </p>
      </Block>
    );
  }
  return (
    <Block
      title="Deployments"
      source={
        <SnapshotSource
          tool={SOURCE_LABEL.deployments}
          capturedAt={deployments.capturedAt}
          stale={deployments.stale}
          now={now}
          rerun="The job runs nightly; check its last run in GitHub Actions."
        />
      }
    >
      {deployments.dryRun && (
        <p className="mb-2 text-sm text-muted">Dry run: nothing was deleted.</p>
      )}
      {deployments.items.length === 0 ? (
        <p className="text-sm text-muted">No production deployments.</p>
      ) : (
        <ul className={LIST}>
          {deployments.items.map((item) => (
            <li key={item.id} className={ROW}>
              <span className="min-w-0">
                <span className="font-mono">{shortSha(item.sha)}</span>
                <span className="block text-xs text-muted">
                  Created {formatDateTime(item.createdAt)} · {item.state}
                  {item.imageSizeBytes !== null && ` · Image ${formatBytes(item.imageSizeBytes)}`}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium">
                {verdictLabel(item.verdict, deployments.dryRun, item.deleted)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function ImagesBlock({ data, now }: { data: AdminOverview; now: Date }) {
  const images = data.vercel.images;
  if (!images) {
    return (
      <Block title="Images" source={<span>From {SOURCE_LABEL.images}</span>}>
        <p className="text-sm text-muted">
          No reading yet. Run /vercel-image-cleanup after the next merge.
        </p>
      </Block>
    );
  }
  return (
    <Block
      title="Images"
      source={
        <SnapshotSource
          tool={SOURCE_LABEL.images}
          capturedAt={images.capturedAt}
          stale={images.stale}
          now={now}
          rerun="Run /vercel-image-cleanup to update."
        />
      }
    >
      {images.items.length === 0 ? (
        <p className="text-sm text-muted">No images in the registry.</p>
      ) : (
        <ul className={LIST}>
          {images.items.map((image) => (
            <li key={image.digest} className={ROW}>
              <span className="min-w-0">
                <span className="block truncate font-mono">
                  {image.tags.length > 0
                    ? image.tags.map((tag) => tag.slice(0, 7)).join(', ')
                    : 'Untagged'}
                </span>
                <span className="block text-xs text-muted">
                  {formatBytes(image.sizeBytes)}
                  {image.publishedAt && ` · Published ${formatShortDate(image.publishedAt)}`}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium">
                {image.inUse ? 'In use' : 'Not used by any deployment'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm">Total {formatBytes(images.totalBytes)}</p>
    </Block>
  );
}

function DeletionsBlock({ data }: { data: AdminOverview }) {
  const { deployments, images } = data.vercel.lastDeletion;
  const line = (count: number, at: string, tool: string) =>
    `${count} deleted · ${formatDateTime(at)} (${tool})`;
  return (
    <Block title="Last deletions" source={<span>From the stored readings, last 90 days</span>}>
      <ul className={LIST}>
        <li className={ROW}>
          <span className="font-medium">Deployments</span>
          <span className="text-right text-muted">
            {deployments
              ? line(deployments.count, deployments.at, 'prune-deployments')
              : 'None in the last 90 days'}
          </span>
        </li>
        <li className={ROW}>
          <span className="font-medium">Images</span>
          <span className="text-right text-muted">
            {images
              ? line(images.count, images.at, '/vercel-image-cleanup')
              : 'None in the last 90 days'}
          </span>
        </li>
      </ul>
    </Block>
  );
}

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  );
}

function AppBlock({ data }: { data: AdminOverview }) {
  const { app } = data;
  const opens = app.opens;
  const split = (counts: { signedIn: number; signedOut: number }) =>
    `${counts.signedIn} signed in · ${counts.signedOut} signed out`;
  const total = (counts: { signedIn: number; signedOut: number }) =>
    counts.signedIn + counts.signedOut;
  return (
    <Block title="App" source={LIVE}>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Users" value={app.users.total} detail={`${app.users.onboarded} onboarded`} />
        <Stat label="Communities" value={app.communities} />
        <Stat
          label="Posts"
          value={app.posts.community + app.posts.direct}
          detail={`${app.posts.community} community · ${app.posts.direct} direct`}
        />
        <Stat label="Ratings" value={app.ratings} />
        <Stat label="Comments" value={app.comments} />
      </div>
      <h3 className="mt-4 mb-2 text-sm font-medium">App opens</h3>
      {opens.countingSince === null ? (
        <p className="text-sm text-muted">No app opens counted yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Today" value={total(opens.today)} detail={split(opens.today)} />
            <Stat label="7 days" value={total(opens.last7Days)} detail={split(opens.last7Days)} />
            <Stat
              label="30 days"
              value={total(opens.last30Days)}
              detail={split(opens.last30Days)}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Counts app opens, not people. Counting since {formatDay(opens.countingSince)}.
          </p>
        </>
      )}
    </Block>
  );
}

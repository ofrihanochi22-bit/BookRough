import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminOverview } from '../api/admin';
import { App } from '../App';
import { useAuthStore } from '../stores/auth';
import { httpError, makeSession, networkError, resetAuthStore, setOnline } from '../test/fixtures';

const api = vi.hoisted(() => ({
  fetchAdminOverview: vi.fn(),
}));

vi.mock('../api/admin', () => ({
  fetchAdminOverview: api.fetchAdminOverview,
  listAdminUsers: vi.fn(),
  listAdminCommunities: vi.fn(),
  removeUserPhoto: vi.fn(),
}));
vi.mock('../api/settings', () => ({
  fetchPublicSettings: vi.fn().mockResolvedValue({ accentColor: 'purple', welcomeTagline: 'x' }),
}));
vi.mock('../api/auth', () => ({ fetchSession: vi.fn(), logout: vi.fn() }));

/* docs/features/admin-overview.md §8 — component, the Overview tab */

const GENERATED = '2026-11-17T12:00:00.000Z';
const HOURS_AGO = (hours: number) =>
  new Date(Date.parse(GENERATED) - hours * 3_600_000).toISOString();
const GB = 1e9;

function meter(
  usedBytes: number,
  pct: number,
  status: 'ok' | 'watch' | 'stop',
  changeBytes: number | null = null,
) {
  return { usedBytes, limitBytes: 10 * GB, pct, status, changeBytes };
}

function overview(vercel: Partial<AdminOverview['vercel']> = {}): AdminOverview {
  return {
    generatedAt: GENERATED,
    app: {
      users: { total: 9, onboarded: 8 },
      communities: 3,
      posts: { community: 20, direct: 4 },
      ratings: 31,
      comments: 12,
      opens: {
        today: { signedIn: 5, signedOut: 2 },
        last7Days: { signedIn: 30, signedOut: 9 },
        last30Days: { signedIn: 90, signedOut: 20 },
        countingSince: '2026-11-17',
      },
    },
    database: {
      usedBytes: 40 * 1024 * 1024,
      limitBytes: 512 * 1024 * 1024,
      pct: 7.8,
      status: 'ok',
    },
    vercel: {
      usage: {
        capturedAt: HOURS_AGO(3),
        stale: false,
        period: null,
        storage: {
          images: meter(4.55 * GB, 45.5, 'ok', 0.4 * GB),
          functions: meter(8.2 * GB, 82, 'stop'),
          deployment: meter(1_720_000, 0, 'ok'),
        },
        others: [{ name: 'Edge Requests', pct: 64, status: 'watch' }],
        highestOther: { name: 'Edge Requests', pct: 64 },
      },
      deployments: {
        capturedAt: HOURS_AGO(5),
        stale: false,
        dryRun: false,
        liveId: 'dpl_live',
        items: [
          {
            id: 'dpl_live',
            sha: 'b5d7d5a1c2d3',
            createdAt: HOURS_AGO(6),
            state: 'READY',
            verdict: 'keep (live)',
            deleted: false,
            imageSizeBytes: 412_000_000,
          },
          {
            id: 'dpl_rb',
            sha: '0a07dac1c2d3',
            createdAt: HOURS_AGO(30),
            state: 'READY',
            verdict: 'keep (rollback)',
            deleted: false,
            imageSizeBytes: null,
          },
          {
            id: 'dpl_old',
            sha: '45d7c8a1c2d3',
            createdAt: HOURS_AGO(60),
            state: 'READY',
            verdict: 'delete',
            deleted: true,
            imageSizeBytes: null,
          },
        ],
      },
      images: {
        capturedAt: HOURS_AGO(50),
        stale: true,
        items: [
          {
            tags: ['b5d7d5a1c2d3'],
            digest: 'aaaaaaaaaaaa',
            sizeBytes: 412_000_000,
            publishedAt: HOURS_AGO(6),
            inUse: true,
          },
          {
            tags: [],
            digest: 'bbbbbbbbbbbb',
            sizeBytes: 410_000_000,
            publishedAt: null,
            inUse: false,
          },
        ],
        totalBytes: 822_000_000,
      },
      lastDeletion: {
        deployments: { at: HOURS_AGO(5), count: 1 },
        images: null,
      },
      ...vercel,
    },
  };
}

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={['/admin/overview']}>
      <App />
    </MemoryRouter>,
  );
}

/** The header's local clock time, as the screen formats it. */
const clockOf = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const block = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  vi.clearAllMocks();
  resetAuthStore();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession({ isAdmin: true }));
  api.fetchAdminOverview.mockResolvedValue(overview());
});

describe('Overview tab', () => {
  it('renders every block from a full answer', async () => {
    // Act
    renderOverview();

    // Assert
    expect(await screen.findByRole('heading', { name: 'Storage limits' })).toBeInTheDocument();
    const storage = block('Storage limits');
    expect(within(storage).getByText('From /vercel-usage · 3 hours ago')).toBeInTheDocument();
    expect(within(storage).getByText('4.55 GB of 10 GB · 45.5% · +400 MB')).toBeInTheDocument();
    expect(
      within(storage).getByText('Approximate: measured from inside the database.'),
    ).toBeInTheDocument();
    expect(within(storage).getByText('Vercel Edge Requests · 64%')).toBeInTheDocument();
    expect(within(storage).getByRole('meter', { name: 'Neon database' })).toHaveAttribute(
      'aria-valuenow',
      '7.8',
    );

    const deployments = block('Deployments');
    expect(within(deployments).getByText('Live')).toBeInTheDocument();
    expect(within(deployments).getByText('Rollback')).toBeInTheDocument();
    expect(within(deployments).getByText('Deleted')).toBeInTheDocument();
    expect(within(deployments).getByText(/Image 412 MB/)).toBeInTheDocument();

    const images = block('Images');
    expect(within(images).getByText('In use')).toBeInTheDocument();
    expect(within(images).getByText('Not used by any deployment')).toBeInTheDocument();
    expect(within(images).getByText('Untagged')).toBeInTheDocument();
    expect(within(images).getByText('Total 822 MB')).toBeInTheDocument();

    const deletions = block('Last deletions');
    expect(
      within(deletions).getByText(/^1 deleted · .* \(prune-deployments\)$/),
    ).toBeInTheDocument();
    expect(within(deletions).getByText('None in the last 90 days')).toBeInTheDocument();

    const appBlock = block('App');
    expect(within(appBlock).getByText('Live')).toBeInTheDocument();
    expect(within(appBlock).getByText('8 onboarded')).toBeInTheDocument();
    expect(within(appBlock).getByText('20 community · 4 direct')).toBeInTheDocument();
    expect(within(appBlock).getByText('5 signed in · 2 signed out')).toBeInTheDocument();
    expect(
      within(appBlock).getByText('Counts app opens, not people. Counting since 17 Nov 2026.'),
    ).toBeInTheDocument();
  });

  it('lists a Stop meter first', async () => {
    // Act
    renderOverview();

    // Assert
    const meters = await screen.findAllByRole('meter');
    expect(meters[0]).toHaveAccessibleName('Vercel Functions Storage');
    expect(within(meters[0]!.closest('li')!).getByText('Stop')).toBeInTheDocument();
  });

  it('marks a stale block and says how to update it', async () => {
    // Act
    renderOverview();

    // Assert
    const images = await screen.findByRole('region', { name: 'Images' });
    expect(within(images).getByText('Stale')).toBeInTheDocument();
    expect(
      within(images).getByText('Last reading 2 days ago. Run /vercel-image-cleanup to update.'),
    ).toBeInTheDocument();
    expect(within(block('Deployments')).queryByText('Stale')).not.toBeInTheDocument();
  });

  it('shows each empty state when nothing was posted yet', async () => {
    // Arrange
    const empty = overview({
      usage: null,
      deployments: null,
      images: null,
      lastDeletion: { deployments: null, images: null },
    });
    empty.app.opens = {
      today: { signedIn: 0, signedOut: 0 },
      last7Days: { signedIn: 0, signedOut: 0 },
      last30Days: { signedIn: 0, signedOut: 0 },
      countingSince: null,
    };
    api.fetchAdminOverview.mockResolvedValue(empty);

    // Act
    renderOverview();

    // Assert
    expect(
      await screen.findByText('No Vercel reading yet. Run /vercel-usage after the next merge.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No reading yet. The prune-deployments job posts one after each run.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No reading yet. Run /vercel-image-cleanup after the next merge.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('None in the last 90 days')).toHaveLength(2);
    expect(screen.getByText('No app opens counted yet.')).toBeInTheDocument();
    // The database is live, so its row is there even with no Vercel reading.
    expect(screen.getByRole('meter', { name: 'Neon database' })).toBeInTheDocument();
  });

  it('notes a dry run and labels its would-be deletions', async () => {
    // Arrange
    const dry = overview();
    dry.vercel.deployments = { ...dry.vercel.deployments!, dryRun: true };
    dry.vercel.deployments.items[2] = { ...dry.vercel.deployments.items[2]!, deleted: false };
    api.fetchAdminOverview.mockResolvedValue(dry);

    // Act
    renderOverview();

    // Assert
    expect(await screen.findByText('Dry run: nothing was deleted.')).toBeInTheDocument();
    expect(screen.getByText('Would be deleted')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', async () => {
    // Arrange
    api.fetchAdminOverview.mockReturnValue(new Promise(() => {}));

    // Act
    renderOverview();

    // Assert
    expect(await screen.findByRole('status', { name: 'Loading the overview' })).toBeInTheDocument();
  });

  it('shows the error state, and Try again loads again', async () => {
    // Arrange
    api.fetchAdminOverview.mockRejectedValueOnce(networkError()).mockResolvedValue(overview());
    renderOverview();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Storage limits' })).toBeInTheDocument();
    expect(api.fetchAdminOverview).toHaveBeenCalledTimes(2);
  });

  it('Refresh re-reads, keeps the blocks on screen, and updates the time', async () => {
    // Arrange
    let answer: (value: AdminOverview) => void = () => {};
    renderOverview();
    await screen.findByText(`Updated ${clockOf(GENERATED)}`);
    api.fetchAdminOverview.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    // Assert — still there while refreshing.
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { name: 'Storage limits' })).toBeInTheDocument();
    const later = { ...overview(), generatedAt: '2026-11-17T15:30:00.000Z' };
    answer(later);
    expect(await screen.findByText(`Updated ${clockOf(later.generatedAt)}`)).toBeInTheDocument();
    expect(screen.getByText('Overview updated')).toBeInTheDocument();
  });

  it('keeps the data and shows an inline error when Refresh fails', async () => {
    // Arrange
    renderOverview();
    await screen.findByRole('heading', { name: 'Storage limits' });
    api.fetchAdminOverview.mockRejectedValue(networkError());

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    // Assert
    expect(
      await screen.findByText(/^Couldn't refresh\. The figures below are from/),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Storage limits' })).toBeInTheDocument();
  });

  it('turns into not-found on a 403, and drops the admin flag', async () => {
    // Arrange
    api.fetchAdminOverview.mockRejectedValue(httpError(403, "You don't have access to this."));

    // Act
    renderOverview();

    // Assert
    await waitFor(() => expect(useAuthStore.getState().isAdmin).toBe(false));
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('says it is offline and disables Refresh', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderOverview();

    // Assert
    expect(
      await screen.findByText("You're offline. Showing the last loaded copy."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });
});

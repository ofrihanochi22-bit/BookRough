import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError, makeCommunity, makePost, networkError, setDesign } from '../test/fixtures';
import { ShareSheet } from './ShareSheet';

const { listMyCommunities, createPost, listFriends, sendRecommendation } = vi.hoisted(() => ({
  listMyCommunities: vi.fn(),
  createPost: vi.fn(),
  listFriends: vi.fn(),
  sendRecommendation: vi.fn(),
}));
vi.mock('../api/communities', () => ({ listMyCommunities }));
vi.mock('../api/posts', () => ({ createPost }));
vi.mock('../api/friends', () => ({ listFriends }));
vi.mock('../api/recommendations', () => ({ sendRecommendation }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const LINK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const jazz = makeCommunity();
const rock = makeCommunity({ id: '1c2d3e4f-0000-4000-8000-00000000abcd', name: 'Rock Club' });

/** The feed route shows where the sheet navigated, with the router state it carried. */
function FeedProbe() {
  const location = useLocation();
  return (
    <p>
      Feed {location.pathname} {JSON.stringify(location.state)}
    </p>
  );
}

function renderSheet(online = true) {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route path="/home" element={<ShareSheet online={online} onClose={onClose} />} />
        <Route path="/communities/new" element={<p>Create community screen</p>} />
        <Route path="/communities/:id" element={<FeedProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onClose };
}

const sheet = () => screen.getByRole('dialog');

async function openCommunities() {
  await userEvent.click(screen.getByRole('button', { name: /To a community/ }));
}

async function chooseJazz() {
  await openCommunities();
  await userEvent.click(await screen.findByRole('button', { name: 'Friday Jazz' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  setDesign('mixtape');
  listMyCommunities.mockResolvedValue([jazz, rock]);
  listFriends.mockResolvedValue([]);
});

afterEach(() => setDesign('current'));

describe('ShareSheet (ui-redesign.md §5.0b)', () => {
  it('offers both ways to share', () => {
    // Act
    renderSheet();

    // Assert
    expect(sheet()).toHaveAccessibleName('Share a song');
    expect(screen.getByRole('button', { name: /To a community/ })).toHaveTextContent(
      "Post it to a group's feed",
    );
    expect(screen.getByRole('button', { name: /To a friend/ })).toHaveTextContent(
      'Send it to one person',
    );
  });

  it('To a friend opens the existing send sheet with its friend picker', async () => {
    // Arrange
    listFriends.mockResolvedValue([]);
    renderSheet();

    // Act
    await userEvent.click(screen.getByRole('button', { name: /To a friend/ }));

    // Assert: SendRecommendationSheet, unchanged — here its empty picker.
    expect(sheet()).toHaveAccessibleName('Send a song');
    expect(await screen.findByText('Add a friend first')).toBeInTheDocument();
  });

  it('To a community lists your communities, each with a mini cassette', async () => {
    // Arrange
    renderSheet();

    // Act
    await openCommunities();

    // Assert
    expect(sheet()).toHaveAccessibleName('Choose a community');
    const list = await screen.findByRole('list', { name: 'Your communities' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual(['Friday Jazz', 'Rock Club']);
    expect(within(list).getAllByTestId('community-cover')).toHaveLength(2);
  });

  it('choosing a community shows its composer, titled with its name', async () => {
    // Arrange
    renderSheet();

    // Act
    await chooseJazz();

    // Assert
    expect(sheet()).toHaveAccessibleName('Friday Jazz');
    expect(screen.getByRole('form', { name: 'Share a song' })).toBeInTheDocument();
    expect(screen.getByLabelText('Share a song or album')).toBeInTheDocument();
  });

  it('posts, closes, and opens that feed with a fresh router state', async () => {
    // Arrange
    createPost.mockResolvedValue(makePost());
    const { onClose } = renderSheet();
    await chooseJazz();

    // Act
    await userEvent.type(screen.getByLabelText('Share a song or album'), LINK);
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Assert
    expect(createPost).toHaveBeenCalledWith(jazz.id, { url: LINK, comment: null });
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText(new RegExp(`Feed /communities/${jazz.id}`))).toHaveTextContent(
      /"sharedAt":\d+/,
    );
  });

  it('cannot be dismissed while the post converts', async () => {
    // Arrange
    createPost.mockReturnValue(new Promise(() => {}));
    const { onClose } = renderSheet();
    await chooseJazz();
    await userEvent.type(screen.getByLabelText('Share a song or album'), LINK);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await userEvent.keyboard('{Escape}');

    // Assert: the reels and the existing progress copy; the sheet stays.
    expect(screen.getByTestId('reel-cassette')).toHaveAttribute('data-spinning', 'true');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the back arrow returns one step at a time', async () => {
    // Arrange
    renderSheet();
    await chooseJazz();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    // Assert
    expect(sheet()).toHaveAccessibleName('Choose a community');
    expect(await screen.findByRole('list', { name: 'Your communities' })).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    // Assert
    expect(sheet()).toHaveAccessibleName('Share a song');
  });
});

describe('ShareSheet — community list states (ui-redesign.md §5.0b, §7)', () => {
  it('shows skeleton rows while loading', async () => {
    // Arrange
    listMyCommunities.mockReturnValue(new Promise(() => {}));
    renderSheet();

    // Act
    await openCommunities();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading your communities' })).toBeInTheDocument();
  });

  it('shows the load error with Try again, which loads again', async () => {
    // Arrange
    listMyCommunities.mockRejectedValueOnce(networkError()).mockResolvedValueOnce([jazz]);
    renderSheet();
    await openCommunities();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your communities.");

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('button', { name: 'Friday Jazz' })).toBeInTheDocument();
    expect(listMyCommunities).toHaveBeenCalledTimes(2);
  });

  it('with no communities, offers Create community, which closes the sheet', async () => {
    // Arrange
    listMyCommunities.mockResolvedValue([]);
    const { onClose } = renderSheet();
    await openCommunities();

    // Assert
    expect(await screen.findByText('Start your first community')).toBeInTheDocument();
    expect(screen.getByText('A community is where your friends share music.')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Create community' }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('Create community screen')).toBeInTheDocument();
  });

  it("returns to a freshly loaded list when the composer's community is gone (404)", async () => {
    // Arrange
    createPost.mockRejectedValue(httpError(404, 'Community not found.'));
    listMyCommunities.mockResolvedValueOnce([jazz, rock]).mockResolvedValueOnce([rock]);
    const { onClose } = renderSheet();
    await chooseJazz();
    await userEvent.type(screen.getByLabelText('Share a song or album'), LINK);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Assert
    await waitFor(() => expect(sheet()).toHaveAccessibleName('Choose a community'));
    expect(await screen.findByRole('button', { name: 'Rock Club' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Friday Jazz' })).not.toBeInTheDocument();
    expect(listMyCommunities).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });
});

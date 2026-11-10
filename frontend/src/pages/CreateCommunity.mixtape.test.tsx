import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setDesign, setOnline } from '../test/fixtures';
import { CreateCommunity } from './CreateCommunity';

vi.mock('../api/communities', () => ({ createCommunity: vi.fn() }));
const { listFriends } = vi.hoisted(() => ({ listFriends: vi.fn() }));
vi.mock('../api/friends', () => ({ listFriends }));
vi.mock('../api/invitations', () => ({ inviteFriends: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/communities/new']}>
      <Routes>
        <Route path="/communities/new" element={<CreateCommunity />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  setDesign('mixtape');
  setOnline(true);
  listFriends.mockResolvedValue([
    { user: { id: 'dana', displayName: 'Dana', profilePictureUrl: null }, since: 'x' },
  ]);
});

afterEach(() => setDesign('current'));

describe('Create Community under Mixtape (ui-redesign.md §5.15)', () => {
  it('shows the logo, the heading and Cancel', () => {
    // Act
    renderForm();

    // Assert
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'New community' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/home');
  });

  it('previews a blank cassette in neutral greys that shows the name as typed', async () => {
    // Arrange
    renderForm();
    const cover = screen.getByTestId('community-cover');
    expect(within(cover).getByText('♪')).toBeInTheDocument();
    const stripe = within(cover).getByTestId('cover-stripe').firstElementChild as HTMLElement;
    expect(stripe.style.backgroundColor).toBe('rgb(174, 174, 183)');

    // Act
    await userEvent.type(screen.getByLabelText('Name'), 'Friday Jazz');

    // Assert
    expect(within(cover).getByText('Friday Jazz')).toBeInTheDocument();
  });

  it('uses the kit fields, with the danger border on an error', async () => {
    // Arrange
    renderForm();
    const name = screen.getByLabelText('Name');
    expect(name.className).toContain('border-[1.5px]');

    // Act
    await userEvent.click(name);
    await userEvent.tab();

    // Assert
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.className).toContain('border-danger');
  });

  it('lists friends in a surface card with accent checkboxes', async () => {
    // Act
    renderForm();

    // Assert
    const list = await screen.findByRole('list', { name: 'Your friends' });
    expect(list.className).toContain('bg-surface');
    expect(within(list).getByRole('checkbox', { name: 'Invite Dana' }).className).toContain(
      'accent-accent',
    );
  });

  it('gives the offline-disabled Create button the dashed treatment', () => {
    // Arrange
    setOnline(false);

    // Act
    renderForm();

    // Assert
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    expect(create.className).toContain('border-dashed');
  });
});

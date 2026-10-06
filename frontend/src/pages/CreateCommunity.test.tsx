import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError, makeCommunity, networkError, setOnline } from '../test/fixtures';
import { CreateCommunity } from './CreateCommunity';

const { createCommunity } = vi.hoisted(() => ({ createCommunity: vi.fn() }));
vi.mock('../api/communities', () => ({ createCommunity }));
const picker = vi.hoisted(() => ({
  listFriends: vi.fn(),
  inviteFriends: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/friends', () => ({ listFriends: picker.listFriends }));
vi.mock('../api/invitations', () => ({ inviteFriends: picker.inviteFriends }));
vi.mock('react-hot-toast', () => ({ default: { error: picker.toastError } }));

function Landed() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <p>
      Landed on {location.pathname} by {navigationType}
    </p>
  );
}

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/home', '/communities/new']} initialIndex={1}>
      <Routes>
        <Route path="/home" element={<p>Dashboard</p>} />
        <Route path="/communities/new" element={<CreateCommunity />} />
        <Route path="/communities/:id" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
}

const nameInput = () => screen.getByLabelText('Name');
const descriptionInput = () => screen.getByLabelText(/Description/);
const createButton = () => screen.getByRole('button', { name: 'Create' });

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  picker.listFriends.mockResolvedValue([]);
});

describe('CreateCommunity — rendering', () => {
  it('shows the fields, counters, a neutral cover preview, the friends picker, and a disabled Create', async () => {
    // Act
    renderForm();

    // Assert
    expect(screen.getByRole('heading', { name: 'New community' })).toBeInTheDocument();
    expect(screen.getByText('0/40')).toBeInTheDocument();
    expect(screen.getByText('0/280')).toBeInTheDocument();
    expect(screen.getByTestId('community-cover')).toHaveTextContent('♪');
    expect(screen.getByRole('heading', { name: 'Invite friends' })).toBeInTheDocument();
    expect(await screen.findByText(/You don't have friends on BookRough yet/)).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it('updates the cover initials and the counter while typing', async () => {
    // Arrange
    renderForm();

    // Act
    await userEvent.type(nameInput(), '  Friday   Jazz');

    // Assert
    expect(screen.getByTestId('community-cover')).toHaveTextContent('FJ');
    expect(screen.getByText('11/40')).toBeInTheDocument();
    expect(createButton()).toBeEnabled();
  });

  it('Cancel goes back to the dashboard', async () => {
    // Arrange
    renderForm();

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));

    // Assert
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});

describe('CreateCommunity — validation', () => {
  it('flags an empty name once the field has been touched (UC-9 fail path)', async () => {
    // Arrange
    renderForm();

    // Act
    await userEvent.click(nameInput());
    await userEvent.click(descriptionInput());

    // Assert
    expect(screen.getByText('A Community name is required.')).toBeInTheDocument();
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
    expect(createButton()).toBeDisabled();
  });

  it('shows the length and character rules without sending anything', async () => {
    // Arrange
    renderForm();

    // Act
    await userEvent.type(nameInput(), 'a');
    await userEvent.tab();

    // Assert
    expect(screen.getByText('Use 2–40 characters.')).toBeInTheDocument();
    await userEvent.type(nameInput(), '@b');
    expect(screen.getByText("That character isn't allowed.")).toBeInTheDocument();
    expect(createCommunity).not.toHaveBeenCalled();
  });

  it('rejects a description over 280 characters and disables Create', async () => {
    // Arrange
    renderForm();
    await userEvent.type(nameInput(), 'Friday Jazz');

    // Act
    await userEvent.click(descriptionInput());
    await userEvent.paste('x'.repeat(281));

    // Assert
    expect(screen.getByText('Keep the description to 280 characters.')).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });
});

describe('CreateCommunity — submitting', () => {
  it('sends the cleaned body, shows Creating…, and replaces the form with the new community', async () => {
    // Arrange
    let resolve: (value: unknown) => void = () => {};
    createCommunity.mockReturnValue(new Promise((done) => (resolve = done)));
    renderForm();
    await userEvent.type(nameInput(), '  Friday   Jazz ');
    await userEvent.type(descriptionInput(), '   ');

    // Act
    await userEvent.click(createButton());

    // Assert
    expect(createCommunity).toHaveBeenCalledWith({ name: 'Friday Jazz', description: null });
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    resolve(makeCommunity({ id: 'new-id' }));
    expect(await screen.findByText('Landed on /communities/new-id by REPLACE')).toBeInTheDocument();
  });

  it('invites the ticked friends after creating, then lands on the community (invite-friends.md §5.2)', async () => {
    // Arrange
    picker.listFriends.mockResolvedValue([
      { user: { id: 'dana', displayName: 'Dana', profilePictureUrl: null }, since: 'x' },
      { user: { id: 'yael', displayName: 'Yael', profilePictureUrl: null }, since: 'x' },
    ]);
    createCommunity.mockResolvedValue(makeCommunity({ id: 'new-id' }));
    picker.inviteFriends.mockResolvedValue([]);
    renderForm();
    await userEvent.type(nameInput(), 'Friday Jazz');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Invite Yael' }));

    // Act
    await userEvent.click(createButton());

    // Assert
    expect(await screen.findByText('Landed on /communities/new-id by REPLACE')).toBeInTheDocument();
    expect(picker.inviteFriends).toHaveBeenCalledWith('new-id', ['yael']);
    expect(picker.toastError).not.toHaveBeenCalled();
  });

  it('sends no invitations when nobody is ticked', async () => {
    // Arrange
    createCommunity.mockResolvedValue(makeCommunity({ id: 'new-id' }));
    renderForm();
    await userEvent.type(nameInput(), 'Friday Jazz');

    // Act
    await userEvent.click(createButton());

    // Assert
    expect(await screen.findByText('Landed on /communities/new-id by REPLACE')).toBeInTheDocument();
    expect(picker.inviteFriends).not.toHaveBeenCalled();
  });

  it('still lands on the new community when the invitations fail, and says so', async () => {
    // Arrange
    picker.listFriends.mockResolvedValue([
      { user: { id: 'dana', displayName: 'Dana', profilePictureUrl: null }, since: 'x' },
    ]);
    createCommunity.mockResolvedValue(makeCommunity({ id: 'new-id' }));
    picker.inviteFriends.mockRejectedValue(networkError());
    renderForm();
    await userEvent.type(nameInput(), 'Friday Jazz');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Invite Dana' }));

    // Act
    await userEvent.click(createButton());

    // Assert
    expect(await screen.findByText('Landed on /communities/new-id by REPLACE')).toBeInTheDocument();
    expect(picker.toastError).toHaveBeenCalledWith(
      "Your community is ready, but the invitations weren't sent. Try again from Invite friends.",
    );
  });

  it('lets you create even when your friends fail to load', async () => {
    // Arrange
    picker.listFriends.mockRejectedValue(networkError());
    createCommunity.mockResolvedValue(makeCommunity({ id: 'new-id' }));
    renderForm();
    await userEvent.type(nameInput(), 'Friday Jazz');
    expect(await screen.findByText("Couldn't load your friends.")).toBeInTheDocument();

    // Act
    await userEvent.click(createButton());

    // Assert
    expect(await screen.findByText('Landed on /communities/new-id by REPLACE')).toBeInTheDocument();
  });

  it('pins a server 422 about the name to the name field and keeps the values', async () => {
    // Arrange
    createCommunity.mockRejectedValue(httpError(422, "That character isn't allowed."));
    renderForm();
    await userEvent.type(nameInput(), 'Friday Jazz');
    await userEvent.type(descriptionInput(), 'Records only.');

    // Act
    await userEvent.click(createButton());

    // Assert
    expect(await screen.findByText("That character isn't allowed.")).toHaveAttribute(
      'id',
      'community-name-error',
    );
    expect(nameInput()).toHaveValue('Friday Jazz');
    expect(descriptionInput()).toHaveValue('Records only.');
    expect(createButton()).toBeDisabled();
  });

  it('pins a server 422 about the description to the description field', async () => {
    // Arrange
    createCommunity.mockRejectedValue(
      httpError(422, "The description has a character that isn't allowed."),
    );
    renderForm();
    await userEvent.type(nameInput(), 'Friday Jazz');
    await userEvent.type(descriptionInput(), 'Records only.');

    // Act
    await userEvent.click(createButton());

    // Assert
    expect(
      await screen.findByText("The description has a character that isn't allowed."),
    ).toHaveAttribute('id', 'community-description-error');
  });

  it.each([
    ['a server error', httpError(500, 'Something went wrong.'), 'Something went wrong.'],
    [
      'no connection',
      networkError(),
      "Can't reach the server. Check your connection and try again.",
    ],
  ])('shows %s as a form error and lets the user retry', async (_case, error, message) => {
    // Arrange
    createCommunity.mockRejectedValue(error);
    renderForm();
    await userEvent.type(nameInput(), 'Friday Jazz');

    // Act
    await userEvent.click(createButton());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(createButton()).toBeEnabled();
  });

  it('shows the offline banner and keeps Create disabled while offline', async () => {
    // Arrange
    setOnline(false);
    renderForm();

    // Act
    await userEvent.type(nameInput(), 'Friday Jazz');

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(
      "You're offline. Connect to create a community.",
    );
    expect(createButton()).toBeDisabled();
  });
});

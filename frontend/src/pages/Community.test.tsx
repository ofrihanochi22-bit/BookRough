import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError, makeCommunity, networkError } from '../test/fixtures';
import { Community } from './Community';

const { getCommunity } = vi.hoisted(() => ({ getCommunity: vi.fn() }));
vi.mock('../api/communities', () => ({ getCommunity }));

const ID = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';

function renderCommunity() {
  return render(
    <MemoryRouter initialEntries={[`/communities/${ID}`]}>
      <Routes>
        <Route path="/communities/:id" element={<Community />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Community page', () => {
  it('shows a skeleton while loading, and asks for the id in the URL', () => {
    // Arrange
    getCommunity.mockReturnValue(new Promise(() => {}));

    // Act
    renderCommunity();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the community' })).toBeInTheDocument();
    expect(getCommunity).toHaveBeenCalledWith(ID);
  });

  it('renders the name, the description with its line breaks, and the member line', async () => {
    // Arrange
    getCommunity.mockResolvedValue(
      makeCommunity({ name: 'Friday Jazz', description: 'Records.\nOnly.', memberCount: 3 }),
    );

    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByRole('heading', { name: 'Friday Jazz' })).toBeInTheDocument();
    const description = screen.getByText(/Records\./);
    expect(description.textContent).toBe('Records.\nOnly.');
    expect(description).toHaveClass('whitespace-pre-line');
    expect(screen.getByText("3 members · You're an admin")).toBeInTheDocument();
    expect(screen.getByText('Posts are coming soon')).toBeInTheDocument();
  });

  it('shows only the count for a plain member', async () => {
    // Arrange
    getCommunity.mockResolvedValue(makeCommunity({ memberCount: 2, myRole: 'MEMBER' }));

    // Act
    renderCommunity();

    // Assert
    expect(await screen.findByText('2 members')).toBeInTheDocument();
  });

  it('renders the standard not-found page on 404, never "not a member"', async () => {
    // Arrange
    getCommunity.mockRejectedValue(httpError(404, 'Community not found.'));

    // Act
    renderCommunity();

    // Assert
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });

  it('shows Try again for any other failure, and recovers', async () => {
    // Arrange
    getCommunity.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(makeCommunity());
    renderCommunity();

    // Act
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this community.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Friday Jazz' })).toBeInTheDocument();
  });
});

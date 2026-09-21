### Database Table Definitions

Below is the detailed breakdown of each table, including column types and constraints.

### 1. users Table

Stores the core authentication and profile data.
- **id** (UUID, Primary Key): Unique identifier for the user.
- **email** (VARCHAR, Unique, Not Null): User's email address.
- **username** (VARCHAR, Unique, Not Null): For @mentions and searching.
- **password_hash** (VARCHAR, Nullable): Hashed password. (Nullable because Google Social Login users won't have a password).
- **display_name** (VARCHAR, Not Null): The name shown on their profile.
- **profile_picture_url** (VARCHAR, Nullable): Link to their hosted avatar.
- **preferred_service** (ENUM, Not Null): e.g., 'SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE', 'TIDAL', 'DEEZER'. Defaults to a specific service.
- **created_at** (TIMESTAMP, Default Current Time).

### 2. communities Table

Stores the group details.
- **id** (UUID, Primary Key).
- **name** (VARCHAR, Not Null): Name of the group.
- **description** (TEXT, Nullable): Group bio or rules.
- **cover_image_url** (VARCHAR, Nullable): Link to the banner image.
- **invite_token** (VARCHAR, Unique, Nullable): A static or regenerating string used to build the invite URLs (UC-15).
- **created_at** (TIMESTAMP, Default Current Time).

### 3. community_members Table (Junction Table)

Resolves the many-to-many relationship between users and communities.
- **user_id** (UUID, Foreign Key referencing users(id)).
- **community_id** (UUID, Foreign Key referencing communities(id)).
- **role** (ENUM, Not Null): e.g., 'ADMIN', 'MEMBER'. Dictates permissions like kicking users (UC-14).
- **joined_at** (TIMESTAMP, Default Current Time).
- (Composite Primary Key: user_id, community_id to prevent duplicate memberships).

### 4. friends Table

Manages the bidirectional social graph and pending requests (UC-6, UC-7, UC-8).
- **requester_id** (UUID, Foreign Key referencing users(id)): The person who sent the invite.
- **addressee_id** (UUID, Foreign Key referencing users(id)): The person receiving the invite.
- **status** (ENUM, Not Null): 'PENDING', 'ACCEPTED'.
- **created_at** (TIMESTAMP, Default Current Time).
- (Composite Primary Key: requester_id, addressee_id. You will need application logic or a database check constraint to ensure that if User A requests User B, User B cannot simultaneously request User A to prevent redundant rows).

### 5. posts Table

The core entity for music recommendations (UC-11).
- **id** (UUID, Primary Key).
- **author_id** (UUID, Foreign Key referencing users(id)).
- **community_id** (UUID, Foreign Key referencing communities(id)).
- **original_url** (VARCHAR, Not Null): The raw link the user pasted.
- **song_title** (VARCHAR, Nullable): Fetched via your Playwright scraper.
- **song_artist** (VARCHAR, Nullable).
- **song_cover_art_url** (VARCHAR, Nullable).
- **universal_link_spotify** (VARCHAR, Nullable): Output from the scraper.
- **universal_link_apple** (VARCHAR, Nullable).
- **universal_link_youtube** (VARCHAR, Nullable).
- **text_comment** (TEXT, Nullable): The author's initial thoughts on the song.
- **created_at** (TIMESTAMP, Default Current Time).

### 6. ratings Table

Stores the feedback on specific posts (UC-13, UC-16).
- **id** (UUID, Primary Key).
- **post_id** (UUID, Foreign Key referencing posts(id)).
- **user_id** (UUID, Foreign Key referencing users(id)): The person leaving the review.
- **score** (SMALLINT, Not Null): A number between 1 and 10.
- **comment** (TEXT, Nullable): Optional text feedback.
- **created_at** (TIMESTAMP, Default Current Time).
- (Unique Constraint on post_id and user_id to ensure a user can only rate a specific post once).

### 7. bookmarks Table

Powers the "Listen Later" queue (UC-12).
- **user_id** (UUID, Foreign Key referencing users(id)).
- **post_id** (UUID, Foreign Key referencing posts(id)).
- **created_at** (TIMESTAMP, Default Current Time).
- (Composite Primary Key: user_id, post_id).

### 8. password_resets Table

Handles the temporary tokens for account recovery (UC-17).
- **id** (UUID, Primary Key).
- **user_id** (UUID, Foreign Key referencing users(id)).
- **token** (VARCHAR, Unique, Not Null): The secure token sent to the email.
- **expires_at** (TIMESTAMP, Not Null): Time when the link becomes invalid (usually 1 hour from creation).
- **created_at** (TIMESTAMP, Default Current Time).


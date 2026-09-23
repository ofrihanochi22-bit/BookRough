### Authentication Architecture & Google OAuth Flow

### 1. Overview & Strategy

**Google Sign-In is the only authentication method.** There is no email/password login, no password hashing, and no password recovery.

The account key is the **`sub` claim** from the Google identity token: an opaque, stable identifier for the Google account. On successful verification the backend issues its own **JSON Web Token (JWT)**, delivered as an `HttpOnly`, `Secure` cookie named `token`, which acts as the session pass for all subsequent API requests.

### 1.1. The email address is never stored

The Google identity token contains an `email` claim. **It is read during verification and then discarded.** It is never written to the database, never written to a log, and never returned by any endpoint - including the administrative area (UC-19).

This is a deliberate data-minimisation decision by the product owner: the operator should not hold user email addresses. The consequences are accepted knowingly:

- **The application can never send email to a user.** No notifications, no announcements, no receipts.
- **A lost Google account is an unrecoverable BookRough account.** Support cannot identify the user, because nothing in the system links a row to a person.
- **Account recovery is Google's job**, outside this application entirely.
- **Cross-provider account linking is moot** - there is only one provider.

**Honest limit on what this achieves.** This reduces *incidental* exposure and eliminates a class of data breach: there is no email address in the database to leak. It is **not** a cryptographic guarantee against the operator, who runs the server and can change the code. The protection comes from the data not existing, not from access control.

**Do not reintroduce an email column, a password column, or a second identity provider without an explicit new decision recorded here and in `docs/tables.md`.**

### 2. The Google OAuth Sequence

Instead of bouncing the user back and forth between server redirects, modern Single Page Applications (SPAs) like React handle the initial Google popup, retrieve a Google identity token, and pass it to the backend for validation.
קטע קוד
sequenceDiagram
participant U as User
participant R as React Frontend
participant G as Google OAuth Server
participant N as Node.js Backend
participant DB as PostgreSQL DB

U->>R: Clicks "Continue with Google"
R->>G: Opens Google Login Popup (Client ID)
G-->>R: Returns Google Identity Token (JWT)
R->>N: POST /api/auth/google (Sends Identity Token)
N->>G: Validates Token Signature & Audience
G-->>N: Token is Valid (Returns User Profile Data)
N->>N: Read sub and picture - DISCARD the email claim
N->>DB: SELECT user WHERE google_sub = sub
alt User is New
N->>DB: INSERT User (google_sub, picture) - no email, no password
N-->>R: Session JWT + needsOnboarding = true
R->>U: Redirect to Complete Your Profile
else User Exists
N->>DB: Retrieve User ID
N-->>R: Session JWT (HttpOnly Cookie)
R->>U: Redirect to Communities Dashboard
end

### 3. Step-by-Step Implementation Guide

### Phase 1: Google Cloud Console Setup

Before writing any code, you need to register your app with Google to get your credentials.
- Go to the Google Cloud Console.
- Create a new project.
- Navigate to **APIs & Services > Credentials**.
- Create new **OAuth 2.0 Client IDs**. Select "Web application".
- Set your **Authorized JavaScript origins** (e.g., http://localhost:3000 for local React development).
- Save the generated **Client ID**. (You do not need the Client Secret for the frontend token flow).

### Phase 2: Frontend Implementation (React)

Use the official community package @react-oauth/google to easily render the login button and handle the popup.
- **Install the library:** npm install @react-oauth/google
- **Wrap your app:** Place the <GoogleOAuthProvider clientId="YOUR_CLIENT_ID"> at the root of your React app.
- **Render the Button:** On your Login/Register screens, use the <GoogleLogin> component.
JavaScript
import { GoogleLogin } from '@react-oauth/google';

<GoogleLogin
onSuccess={credentialResponse => {
// credentialResponse.credential contains the Google JWT
// Send this token to your Node.js backend
sendTokenToBackend(credentialResponse.credential);
}}
onError={() => {
console.log('Login Failed');
}}
/>

### Phase 3: Backend Verification (Node.js/TypeScript)

**Never** trust the token sent by the frontend blindly. Your Node server must verify that the token was actually signed by Google and intended for your application.
- **Install Google Auth Library:** npm install google-auth-library
- **Create the verification service** (service layer sees no req/res, per CLAUDE.md section 4):

TypeScript
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export async function authenticateWithGoogle(idToken: string) {
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError('Sign-in failed. Please try again.', 401);
  }

  const googleSub = payload?.sub;
  if (!googleSub) throw new AppError('Sign-in failed. Please try again.', 401);

  // payload.email is deliberately NOT read, NOT stored, and NOT logged.
  // The account key is the opaque `sub` claim. See section 1.1.
  const picture = payload?.picture ?? null;

  let user = await prisma.user.findUnique({ where: { googleSub } });

  if (!user) {
    user = await prisma.user.create({
      data: { googleSub, profilePictureUrl: picture },
    });
  }

  const needsOnboarding = !user.username || !user.preferredService;

  return { user, needsOnboarding };
}

The controller signs the app JWT and sets the cookie:

TypeScript
const { user, needsOnboarding } = await authenticateWithGoogle(req.body.token);

const appToken = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '7d' });

res.cookie('token', appToken, {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
});

return res.status(200).json(success({ user: toPublicUser(user), needsOnboarding }));

**`toPublicUser` is mandatory.** Never return a raw Prisma user object from any endpoint. Serialise the response explicitly, field by field, so that a column added later cannot leak by accident. This is the safeguard that keeps section 1.1 true as the schema grows.

### 4. Handling Database Edge Cases

- **Account collision: cannot happen.** With a single provider and `google_sub` as a unique key, there is no second route to the same person, so there is no merge logic to write. This is a direct simplification gained by dropping email/password login.
- **Missing profile data.** Google supplies neither a unique `username` nor a `preferred_service`. A newly created user therefore has a row but an incomplete profile. The backend returns `needsOnboarding: true` and the frontend routes to the **Complete Your Profile** screen to collect both before the dashboard becomes reachable.
- **Abandoned onboarding.** A user who closes the app mid-onboarding leaves a row with no username. On their next sign-in the same `sub` matches, `needsOnboarding` is true again, and they resume. Do not create a second row, and do not treat the incomplete row as corrupt.
- **Username collision.** Usernames are user-chosen and unique. Convert the Prisma `P2002` unique-constraint error into a friendly `AppError` - "That username is already taken." - per CLAUDE.md section 4.
- **Google picture unavailable.** `payload.picture` may be absent, or may later 404. `profile_picture_url` is nullable and the UI falls back to the generated avatar (CLAUDE.md section 8).
- **Revoked Google access.** If a user revokes the app from their Google account, future sign-ins fail verification. Existing session cookies stay valid until they expire - acceptable for a 7-day session at this scale.

### 5. Administrative Access (UC-19)

- The admin area is gated on `users.role = 'ADMIN'`.
- **The role is set directly in the database**, never through an API. There is no endpoint that grants admin, so there is no endpoint to abuse.
- Authorisation is enforced **server-side on every admin endpoint**. Hiding the navigation entry in the frontend is presentation, not security.
- A non-admin hitting an admin route receives `403`, and the frontend renders the standard not-found page rather than confirming the area exists.
- **The admin area cannot display an email address, because none is stored** (section 1.1). This constraint is the reason the authentication design looks the way it does - see UC-19.

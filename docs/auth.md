### Authentication Architecture & Google OAuth Flow

### 1. Overview & Strategy

The application utilizes a dual-strategy authentication system:
- **Standard Login:** Email and hashed password (using bcrypt).
- **Social Login:** Google OAuth 2.0.
Regardless of how the user logs in, the backend will ultimately generate and return a unified **JSON Web Token (JWT)**. This JWT acts as the user's "session pass" for all subsequent API requests.

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
N->>DB: Check if user exists by Google Email
alt User is New
N->>DB: Create new User (null password, generate username)
else User Exists
N->>DB: Retrieve User ID
end
N->>N: Generate App Session JWT
N-->>R: Return Session JWT (HttpOnly Cookie)
R->>U: Redirect to Communities Dashboard

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
- **Create the Verification Route:**
TypeScript
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/api/auth/google', async (req, res) => {
const { token } = req.body;

try {
// 1. Verify the token with Google
const ticket = await client.verifyIdToken({
idToken: token,
audience: process.env.GOOGLE_CLIENT_ID,
});

// 2. Extract user payload
const payload = ticket.getPayload();
const email = payload?.email;
const name = payload?.name;
const picture = payload?.picture;

// 3. Database Logic (Create or Login)
let user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

if (!user) {
// Create new user (handling the nullable password_hash from our DB schema)
user = await db.query(
'INSERT INTO users (email, display_name, profile_picture_url) VALUES ($1, $2, $3) RETURNING *',
[email, name, picture]
);
}

// 4. Generate your own App Session JWT
const appToken = jwt.sign(
{ userId: user.id },
process.env.JWT_SECRET,
{ expiresIn: '7d' }
);

// 5. Send token to client (Preferably in an HttpOnly cookie for security)
res.cookie('token', appToken, { httpOnly: true, secure: true });
return res.status(200).json({ message: "Authenticated successfully", user });

} catch (error) {
return res.status(401).json({ error: "Invalid Google Token" });
}
});

### 4. Handling Database Edge Cases

Because we defined password_hash as nullable in the database schema, this architecture handles edge cases gracefully:
- **Account Collision:** If a user first registers with danny@gmail.com using a standard password, and later clicks "Continue with Google" using that same email, the backend will find the existing email in step 3. It will simply log them in and issue an app token, effectively merging the auth methods seamlessly.
- **Missing Data:** Google will not provide the preferred_service (e.g., Spotify, Apple Music) or a unique username. When a new user is created via Google, you should redirect them to a specific "Complete Your Profile" onboarding screen in React to gather these required fields before letting them fully access the application.


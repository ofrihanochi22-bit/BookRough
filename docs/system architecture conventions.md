### 1. Error Handling Conventions

The goal of error handling is to be predictable. The frontend should always know exactly what shape of error it will receive, and the backend should never leak sensitive database details.

### Backend (Node.js/Express)

- **Custom Error Classes:** Create an AppError class that extends the built-in Error. It should accept an HTTP status code (e.g., 400, 404, 500) and a safe message.
- **Centralized Middleware:** Use a single global error-handling middleware at the end of your Express routes. If a controller encounters an issue, it should call next(new AppError('Message', 400)), which sends it to the central handler.
- **Never Leak DB Errors:** If Prisma throws a unique constraint error (e.g., duplicate email), catch it and convert it to a friendly 400 AppError ("Email already exists") rather than returning the raw SQL error to the client.

### Frontend (React)

- **Axios/Fetch Interceptors:** Set up a global interceptor for your API client. If it detects a 401 Unauthorized error, automatically trigger the logout flow and redirect to the login screen.
- **User-Facing Toasts:** If the interceptor catches a 4xx or 5xx error, automatically display the safe error.message provided by the backend in a UI toast notification.
- **React Error Boundaries:** Wrap your main application routes in Error Boundaries so that if a specific component crashes, the whole app doesn't go white—instead, it displays a localized "Something went wrong" fallback UI.

### 2. Logging Conventions

Logs are a timeline of your system's health. They should be structured, searchable, and clean. Avoid console.log("here 1").

### Log Levels

- **ERROR**: For failures requiring immediate action. Example: Database connection dropped, Playwright scraper crashed, third-party API is down.
- **WARN**: For handled exceptions or suspicious behavior. Example: Failed login attempts, invalid JWTs, rate limit reached.
- **INFO**: For critical business logic milestones. Example: "User registered", "New Community created", "Post processed successfully". Do not log every single HTTP request here.
- **DEBUG**: For verbose data dumps used strictly during local development. These should be turned off in production.

### Formatting

Logs should be standardized. In Node.js, it is highly recommended to use a lightweight logger like **Pino** or **Winston**.
- **Required Fields:** Every log must include a [Timestamp], [Level], [Context/Module] (e.g., AuthService, PlaywrightScraper), and the [Message].
- **Contextual Data:** If a log pertains to a user, always include the userId in the metadata, but **never** log passwords, tokens, or raw PII (Personally Identifiable Information).

### 3. Data Transfer Between Layers

Data should be validated and sanitized as it crosses the boundaries of your architecture.

### The Backend Flow (Router → Controller → Service → Database)

- **Router Layer:** Only handles HTTP route definitions.
- **Controller Layer (Input Validation):** This is the bouncer. Use a validation library (like **Zod**) to parse the incoming req.body and req.params. If the data is invalid, reject it immediately with a 400 status. Do not pass bad data deeper into the app.
- **Service Layer (Business Logic):** This layer handles the heavy lifting (e.g., hashing passwords, calling Playwright). **Rule:** Services should never know about HTTP requests or responses (req/res). They take raw data arguments and return raw data objects or throw errors.
- **Database Layer (Prisma):** Handles strict DB queries.

### API Response Format (Backend → Frontend)

Standardize your API responses so the frontend doesn't have to guess where the data is. Use a strict wrapper object for every response.

### Success Response Format:

JSON
{
"status": "success",
"data": {
"user": { "id": "123", "username": "danny" }
}
}

### Error Response Format:

JSON
{
"status": "error",
"code": 404,
"message": "Community not found."
}


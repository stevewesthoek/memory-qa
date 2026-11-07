# Raw Input: Login Selector Failure

This is fake demo data.

Use it to show how generic AI triage differs from memory-aware QA triage.

## Failed test

```text
Test: login-smoke.spec.ts > user can log in
Framework: Playwright
Environment: test
Branch: ui-refresh-login
Browser: Chromium
Run: nightly-smoke
```

## Error

```text
TimeoutError: locator('[data-testid="login-submit"]') did not become visible within 5000ms

  14 | await page.goto('/login')
  15 | await page.fill('[data-testid="email"]', testUser.email)
  16 | await page.fill('[data-testid="password"]', testUser.password)
> 17 | await page.locator('[data-testid="login-submit"]').click()
     |                                                       ^
  18 | await expect(page).toHaveURL('/dashboard')
```

## Screenshot notes

```text
Login page loaded.
Email and password fields are visible.
Submit button is visible with label "Sign in".
No error banner is visible.
No loading spinner is visible.
```

## API notes

```text
GET /session/status returned 200.
POST /auth/login was not called because the test never clicked the submit button.
No backend error is visible in the browser console.
```

## Recent change

```text
Login page was updated in the UI refresh.
Button markup changed from data-testid="login-submit" to an accessible role/name pattern.
The visible button text changed from "Log in" to "Sign in".
```

## Tester notes

```text
This failed after a UI-only change.
The same user credentials work manually.
The app appears available.
The failure happens before authentication.
```

## What a tester should notice

- Current evidence does not point to a backend outage.
- The test never reaches the login API call.
- The visible button exists, but the old locator no longer finds it.
- This is likely a locator strategy problem, not a product regression.

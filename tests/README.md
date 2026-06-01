# Venue Module Test Suite

Comprehensive test coverage for the Venue Management Module, including both backend API and frontend UI tests.

## Running Tests

### All Tests
```bash
npx vitest
```

### Run Tests Once (CI Mode)
```bash
npx vitest run
```

### Run Tests with UI
```bash
npx vitest --ui
```

### Run Tests with Coverage
```bash
npx vitest run --coverage
```

### Run Specific Test File
```bash
npx vitest server/__tests__/venue.test.ts
npx vitest client/src/__tests__/PublicVenuePage.test.tsx
npx vitest client/src/__tests__/AdminVenueTable.test.tsx
```

## Test Structure

### Backend Tests (`server/__tests__/venue.test.ts`)

#### Venue Creation Tests
- ✅ Creates venue with valid data
- ✅ Rejects creation without authentication
- ✅ Rejects venue with missing required fields
- ✅ Rejects venue with invalid capacity (negative number)

#### Venue Approval Workflow Tests
- ✅ Approves venue with admin authentication
- ✅ Rejects venue with admin authentication
- ✅ Denies approval attempt by non-admin user
- ✅ Denies approval attempt without authentication
- ✅ Rejects invalid status values

#### Public Venue Page Tests
- ✅ Loads approved venue public page
- ✅ Returns 404 for rejected venue
- ✅ Returns 404 for non-existent venue slug

#### Admin Venue List Tests
- ✅ Returns all venues for admin user
- ✅ Denies access to non-admin user
- ✅ Denies access without authentication

### Frontend Tests

#### Public Venue Page (`client/src/__tests__/PublicVenuePage.test.tsx`)
- ✅ Loads and displays venue information
- ✅ Displays amenities when available
- ✅ Displays upcoming events at the venue
- ✅ Shows 404 message when venue not found
- ✅ Shows loading state initially
- ✅ Displays contact links when available

#### Admin Venue Table (`client/src/__tests__/AdminVenueTable.test.tsx`)
- ✅ Displays all venues in table format
- ✅ Displays owner information for each venue
- ✅ Displays status badges correctly
- ✅ Displays creation dates
- ✅ Shows approve and reject buttons for pending venues
- ✅ Calls approve API when approve button is clicked
- ✅ Shows view public page button for approved venues
- ✅ Shows edit and delete buttons for all venues
- ✅ Confirms before deleting a venue
- ✅ Shows empty state when no venues exist

## Test Coverage Requirements

The test suite covers the following critical paths:

### 1. Venue Creation ✅
- Valid data acceptance
- Invalid data rejection
- Authentication requirements
- Field validation

### 2. Approval Workflow ✅
- Admin-only approval/rejection
- Status updates
- Permission checks
- Dual-field consistency (approved + status)

### 3. Public Access ✅
- Approved venue visibility
- Rejected/pending venue hiding
- 404 handling
- Data display correctness

### 4. Admin Interface ✅
- Table display
- Owner information
- Status filtering
- Action buttons (approve/reject/edit/delete)
- Confirmation dialogs

## Test Database

Tests use a separate test database to avoid affecting development data. The database connection is configured in `tests/setup.ts`.

## Mocking Strategy

- **Authentication**: Mocked via headers (admin/user)
- **API Calls**: Mocked using `vi.fn()` from Vitest
- **Navigation**: Mocked `wouter` hooks
- **Toasts**: Mocked `useToast` hook

## Continuous Integration

To run tests in CI/CD:

```bash
npx vitest run --coverage
```

This will:
1. Run all tests once
2. Generate coverage report
3. Exit with appropriate status code

## Adding New Tests

When adding new venue-related features, ensure you:

1. Add backend tests in `server/__tests__/venue.test.ts`
2. Add frontend tests in appropriate `client/src/__tests__/*.test.tsx` file
3. Test both success and failure cases
4. Test authentication and authorization
5. Test data validation

## Test Conventions

- Use descriptive test names: `should [expected behavior] when [condition]`
- Group related tests with `describe` blocks
- Use `beforeEach` for common setup
- Clean up after tests (handled automatically by setup.ts)
- Mock external dependencies
- Test both happy path and error cases

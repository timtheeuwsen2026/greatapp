# Pre-delivery checklist

Every bug the client reported in the V15 calendar work is listed at the bottom
of this file. Not one of them would have been caught by reading the code, and
only two would have been caught by the test suite. They were all found by
someone signing in and clicking.

That is the whole lesson. This checklist is the short version.

---

## The one rule

**Log in as the role and click the path, before you say it's done.**

Not "the endpoint returns 200". Not "the tests pass". Sign in as a venue
owner, open the screen, press the button, and look at what happens.

If you cannot log in as that role, say so out loud when you deliver, and name
what you did not test. That is a normal thing to say. Silence reads as
"I checked", and the client finds it instead.

---

## Before you hand anything over

### 1. Run the automated pass — 2 minutes

```bash
npx vitest run
```

```bash
npm run build
```

```bash
npm run verify:ical
```

```bash
npm run verify:flash-deals
```

Green here means nothing is *obviously* broken. It does not mean the feature
works. Four of the bugs below passed all of this.

### 2. Click every button you touched

For each screen you changed, signed in as the right role:

- [ ] Open it. Does it render, or does the error boundary catch something?
- [ ] Press the primary button. Does it do the thing?
- [ ] Press it with nothing filled in. Does it explain, or throw?
- [ ] Press it twice quickly. Two records?
- [ ] Undo your selection (unpick a date, clear a field). Still standing?

### 3. Keep the browser console and Network tab open the whole time

This is where the client's bug reports come from, so get there first.

- **Console** — any red? A caught error still means something is wrong.
- **Network** — click your action and look at the request:
  - Is the **method** right? (`POST`, not the URL in the method slot)
  - Is there an **Authorization** header? Owner-only endpoints need one.
  - What is the **status**? A 200 that returns `{"message": "..."}` is a bug.
  - Open the **response body**. Is anything in there that should not leave the
    server — private notes, internal ids, prices you removed?

### 4. Test with ugly data, not clean data

Clean data is why the six-minute sync shipped.

- [ ] The **empty** case — no venues, no deals, no bookings
- [ ] The **one** case — exactly one row (off-by-one hides here)
- [ ] The **many** case — hundreds or thousands, not three
- [ ] The **old** case — records from years ago
- [ ] The **wrong shape** case — a timed event where you expected all-day, a
      single day where you expected a range, a name with a comma in it

### 5. Ask "what else calls this?"

Before you finish, grep for other callers of anything you changed. The
availability POST was broken from *two* screens; the report only mentioned one.

```bash
grep -rn "the-thing-you-changed" client/src server
```

### 6. Say what you did not test

In your delivery message. Explicitly. It is the cheapest trust you will ever
buy, and it tells the client where to look.

---

## Codebase-specific traps

These are real patterns in this repo. Run them before delivering.

### Raw `fetch` on an owner-only endpoint

Auth tokens ride on `apiRequest`, **not** on `window.fetch`. A bare fetch to a
protected route comes back 401 with a JSON body, `.json()` parses it happily,
and the next `.map` takes the page down.

```bash
grep -rn "queryFn" client/src --include=*.tsx -A2 | grep "fetch(" | grep -v apiRequest
```

Every hit needs both of these, or it should use `apiRequest`:

```ts
const res = await fetch(url);
if (!res.ok) throw new Error("...");   // ← the missing line, every time
```

### `apiRequest` arguments the wrong way round

The signature is `apiRequest(method, url, body)`. Reversed, `fetch` gets the
URL where the verb belongs and refuses it outright.

```bash
grep -rn "apiRequest(" client/src --include=*.tsx --include=*.ts \
  | grep -vE "apiRequest\(\s*[\"'\`](GET|POST|PUT|PATCH|DELETE)"
```

### `as any` on a handler

`as any` silences TypeScript exactly where it was about to be right. The date
picker reports a cleared range as `undefined`; the cast let that into state.

```bash
grep -rn "onSelect={.*as any}\|onChange={.*as any}" client/src --include=*.tsx
```

### `.map` on something that came from the network

Defaulting with `= []` only helps when the value is `undefined`. An error
object is not undefined.

```ts
const list = Array.isArray(data) ? data : [];   // ← survives any response
```

### Dates crossing the JSON boundary

Schemas generated from the database expect real `Date` objects. JSON has no
Date type, so a browser can only ever send a string. Use `z.coerce.date()` on
anything that arrives in a request body.

### Comparing dates when you mean days

Availability, bookings and blocks are day-level ideas. A block at 06:00 does
not overlap a date picker's midnight. Normalise to whole days on both sides.

### Writing rows in a loop

One `await db.insert(...)` per item is fine for three items and unusable for
three thousand. Build the array, then insert in chunks.

---

## Every bug the client found, and what would have caught it

| What they saw | Real cause | What would have caught it |
|---|---|---|
| `u.map is not a function`, dashboard gone | Bare `fetch` on an owner-only route → 401 JSON → `.map` on an object | Opening the Availability tab once, signed in |
| `not a valid HTTP method` | `apiRequest(url, method)` — arguments reversed | Pressing Add Block once |
| `Cannot read properties of undefined (reading 'from')` | Cleared date range → `undefined` into state, hidden by `as any` | Clicking the same date twice |
| `Expected date, received string` | Schema wanted `Date`; JSON can only send a string | Watching the Network tab on submit |
| 14 years of history imported | No date window on import | Testing with a real calendar, not an empty one |
| Six minutes to sync | One INSERT per event | Testing with thousands of rows, not three |
| Private event titles on the wire | Conflict endpoint returned `notes` | Reading the response body in the Network tab |
| Blocked 6am–3pm, still shown free | Instants compared where days were meant | Testing a timed event, not just an all-day one |
| Calendar sync "not built" | It was built, but only inside the onboarding wizard | Asking "where would a venue actually look for this?" |
| Dead "Connect Google Calendar" button | Old stub next to a real feature | Clicking every button on the screen, including ones you didn't add |

---

## When something does come back

1. **Reproduce it first.** Write the smallest script that shows the wrong
   answer, and run it before you change anything. If you cannot reproduce it,
   you cannot know you fixed it.
2. **Fix the class, not the instance.** The availability POST was broken from
   two screens. The raw-fetch bug existed in two components.
3. **Write the test that would have caught it**, with a comment saying what
   the client saw. Six months from now that comment is the only thing
   explaining why the test exists.
4. **Check the neighbours.** Every fix in this project revealed the next
   layer down. Look one level further before saying it's done.

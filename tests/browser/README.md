# Booking layout regression checks

Run `npx playwright install chromium` once, then `npm run test:bookings-layout`.
The suite starts Vite automatically and uses fixture API responses; no database,
sign-in, or real booking is needed. Maps are stubbed so network access does not
affect layout checks.

The tests cover 320px phones, portrait and landscape, tablets, laptops, a reduced
CSS viewport equivalent to browser zoom, and resizing an already-open booking.
They check actual element bounds, horizontal overflow, scrolling to payment and
group details, and closing the popup after scrolling.

To use an existing Chromium installation, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. Failure screenshots
and traces are saved in the ignored `test-results/` directory.

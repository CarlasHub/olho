import test from "node:test";
import assert from "node:assert/strict";

import { startFixtureServer } from "./fixtures/server.mjs";
import {
  launchExtension,
  openFixturePage,
  waitForNoConsoleErrors,
  screenshotOnFailure
} from "./e2e-real-utils.mjs";

const FIXTURES = [
  { file: "normal-page.html", marker: "Normal Fixture Page" },
  { file: "long-page.html", marker: "OLHO_LONG_PAGE_TOP_MARKER" },
  { file: "sticky-header-page.html", marker: "Sticky Header Marker" },
  { file: "lazy-content-page.html", marker: "LAZY_CONTENT_(PENDING|LOADED)_MARKER" },
  { file: "hostile-css-page.html", marker: "HOSTILE_CSS_MARKER" },
  { file: "overflow-hidden-page.html", marker: "OLHO_OVERFLOW_MARKER_TOP" },
  { file: "iframe-page.html", marker: "Iframe Fixture" },
  { file: "form-page.html", marker: "Form Fixture" },
  { file: "dark-page.html", marker: "OLHO_DARK_MARKER" },
  { file: "high-z-index-page.html", marker: "HIGH_Z_MODAL_MARKER" },
  { file: "video-like-page.html", marker: "OLHO_VIDEO_LIKE_MARKER" },
  { file: "animated-page.html", marker: "OLHO_ANIMATED_PAGE_MARKER" },
  { file: "restricted-simulation-page.html", marker: "Restricted Capture Simulation" }
];

test("fixture server serves all local QA pages with expected markers", async () => {
  const server = await startFixtureServer();
  try {
    for (const fixture of FIXTURES) {
      const response = await fetch(server.urlFor(fixture.file));
      assert.equal(response.ok, true, `fixture must load: ${fixture.file}`);
      const html = await response.text();
      assert.match(html, new RegExp(fixture.marker));
    }
  } finally {
    await server.close();
  }
});

test(
  "real browser can open fixture pages while extension is loaded",
  { timeout: 120_000 },
  async () => {
    const fixtureServer = await startFixtureServer();
    const session = await launchExtension("fixture-pages-real-browser");

    try {
      for (const fixture of FIXTURES) {
        const opened = await openFixturePage(session, fixtureServer, fixture.file, `fixture-${fixture.file}`);
        const text = await opened.page.evaluate(() => document.body?.innerText || "");
        assert.match(text, new RegExp(fixture.marker), `Missing marker for ${fixture.file}`);
        waitForNoConsoleErrors(opened.telemetry, `fixture-${fixture.file}`);
      }
    } catch (error) {
      const artifactDir = await screenshotOnFailure(session, error);
      throw new Error(`${String(error?.message || error)}\nFailure artifacts: ${artifactDir}`);
    } finally {
      await fixtureServer.close();
      await session.close();
    }
  }
);

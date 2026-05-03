import test from "node:test";

import {
  assertNoPageErrors,
  assertNoUnexpectedOutboundRequests,
  withRealExtension
} from "./e2e-real-utils.mjs";
import { startFixtureServer } from "./fixtures/server.mjs";
import { updateCoreProof } from "./proof-artifacts.mjs";

test(
  "runtime network monitor: core UI flows perform no unexpected outbound requests",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-runtime-network-monitor", async ({ browser, openPage }) => {
      const fixtureServer = await startFixtureServer();
      const allowHttpHosts = new Set([`127.0.0.1:${fixtureServer.port}`]);

      try {
        const normalFixture = await browser.newPage();
        await normalFixture.goto(fixtureServer.urlFor("normal-page.html"), {
          waitUntil: "load",
          timeout: 20_000
        });
        await normalFixture.waitForSelector("text/Normal Fixture Page", { timeout: 15_000 });
        await normalFixture.bringToFront();

        const popup = await openPage("popup.html", "network-popup");
        await popup.page.waitForSelector('button[data-action="capture-visible"]', { timeout: 15_000 });

        const gallery = await openPage("gallery.html", "network-gallery");
        const editor = await openPage("editor.html?import=1", "network-editor");
        const exportPage = await openPage("export-report.html", "network-export");
        const recorder = await openPage("record.html", "network-recorder");
        const options = await openPage("options.html", "network-options");
        const privacy = await openPage("privacy.html", "network-privacy");

        for (const source of [popup, gallery, editor, exportPage, recorder, options, privacy]) {
          assertNoPageErrors(source.telemetry, source.telemetry.label || "network-page");
          assertNoUnexpectedOutboundRequests(source.telemetry, source.telemetry.label || "network-page", {
            allowHttpHosts
          });
        }

        await updateCoreProof((current) => ({
          ...current,
          runtimeNetwork: {
            ...(current.runtimeNetwork || {}),
            monitoredInRealBrowser: true,
            popup: true,
            editor: true,
            memory: true,
            export: true,
            recorderLoad: true,
            settings: true,
            privacy: true,
            unexpectedOutboundRequests: 0
          }
        }));

        await normalFixture.close().catch(() => {});
      } finally {
        await fixtureServer.close().catch(() => {});
      }
    });
  }
);

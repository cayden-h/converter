import { describe, expect, test } from "vitest";
import { forwardProgress } from "../../src/main/progress";
import { JobRunner } from "../../src/main/engine/job";
import { buildRegistry } from "../../src/main/engine/registry";

function registryWith(convert: () => Promise<string>) {
  return buildRegistry(
    {
      fake: {
        tool: "imagemagick",
        priority: 10,
        properties: { from: { images: ["png"] }, to: { images: ["jpeg"] } },
        convert,
      },
    },
    { imagemagick: "/bin/magick" },
  );
}

describe("forwardProgress", () => {
  test("sends every progress event to the renderer", async () => {
    const sent: { channel: string; payload: unknown }[] = [];
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
    };
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });

    forwardProgress(runner, () => fakeWindow as never);
    await runner.run([{ path: "/in/a.png", output: "jpg" }]);

    const statuses = sent.map((s) => (s.payload as { status: string }).status);
    expect(statuses).toContain("running");
    expect(statuses).toContain("done");
  });

  test("does not throw when the window is already destroyed", async () => {
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    // A user can close the window mid-batch. Sending to destroyed webContents
    // throws, which would take down the whole conversion.
    forwardProgress(runner, () => ({ isDestroyed: () => true }) as never);
    await expect(runner.run([{ path: "/in/a.png", output: "jpg" }])).resolves.toBeDefined();
  });

  test("survives having no window at all", async () => {
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    forwardProgress(runner, () => null);
    await expect(runner.run([{ path: "/in/a.png", output: "jpg" }])).resolves.toBeDefined();
  });
});

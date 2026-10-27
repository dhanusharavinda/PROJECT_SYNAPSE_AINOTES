import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { createUpdates, type UpdateState } from "../desktop/updates";
function fixture() {
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(async () => {}),
    downloadUpdate: vi.fn(async () => {}),
    quitAndInstall: vi.fn(),
  });
  const states: UpdateState[] = [];
  const updates = createUpdates(updater, "1.1.1", (state) =>
    states.push(state),
  );
  return { updater, updates, states };
}
it("requires an explicit download and waits for a verified download before installation", async () => {
  const { updater, updates } = fixture();
  expect(updater.autoDownload).toBe(false);
  expect(updater.autoInstallOnAppQuit).toBe(false);
  expect(() => updates.install()).toThrow("Download");
  updater.emit("update-available", { version: "1.2.0" });
  expect(updates.state()).toMatchObject({
    stage: "available",
    visible: true,
    version: "1.2.0",
  });
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
  await updates.download();
  await updates.download();
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  updater.emit("download-progress", { percent: 125 });
  expect(updates.state().percent).toBe(100);
  expect(() => updates.install()).toThrow();
  updater.emit("update-downloaded", { version: "1.2.0" });
  await updates.check(true);
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
  updates.install();
  expect(updater.quitAndInstall).toHaveBeenCalledOnce();
});
it("does not start duplicate update checks or download without an available release", async () => {
  const { updater, updates } = fixture();
  await updates.check();
  await updates.check(true);
  await updates.download();
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
  updater.emit("update-not-available");
  expect(updates.state()).toMatchObject({ stage: "current", visible: false });
  await updates.check(true);
  updater.emit("update-not-available");
  expect(updates.state()).toMatchObject({ stage: "current", visible: true });
});
it("keeps automatic network failures quiet and explains missing releases on manual checks", async () => {
  const { updater, updates } = fixture();
  updater.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
  await updates.check();
  expect(updates.state()).toMatchObject({ stage: "error", visible: false });
  updater.checkForUpdates.mockRejectedValueOnce(
    new Error("No published versions on GitHub"),
  );
  await updates.check(true);
  expect(updates.state()).toMatchObject({
    stage: "error",
    visible: true,
    message: "No updates have been published yet. Try again later.",
  });
});
it("recovers from a download failure without installing anything", async () => {
  const { updater, updates } = fixture();
  updater.emit("update-available", { version: "1.2.0" });
  updater.downloadUpdate.mockRejectedValueOnce(new Error("offline"));
  await updates.download();
  await Promise.resolve();
  expect(updates.state()).toMatchObject({ stage: "error", visible: true });
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
  await updates.check(true);
  updater.emit("update-available", { version: "1.2.0" });
  await updates.download();
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(2);
});

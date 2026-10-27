// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import DesktopUpdates from "../src/DesktopUpdates";
import type { UpdateBridge, UpdateState } from "../desktop/updates";
afterEach(() => {
  cleanup();
  delete window.synapseUpdates;
});
function setup(stage: UpdateState["stage"]) {
  let listener: (state: UpdateState) => void = () => {};
  const state: UpdateState = {
    stage,
    currentVersion: "1.1.1",
    version: "1.2.0",
    visible: true,
  };
  const bridge: UpdateBridge = {
    state: vi.fn(async () => state),
    check: vi.fn(async () => state),
    download: vi.fn(async () => ({ ...state, stage: "downloading" as const })),
    install: vi.fn(async () => {}),
    subscribe: (fn) => {
      listener = fn;
      return () => {};
    },
  };
  window.synapseUpdates = bridge;
  return {
    bridge,
    send: (patch: Partial<UpdateState>) =>
      act(() => listener({ ...state, ...patch })),
  };
}
it("offers a download without interrupting writing, then shows download progress", async () => {
  const { bridge, send } = setup("available");
  render(<DesktopUpdates beforeRestart={async () => {}} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Download update" }),
  );
  await waitFor(() => expect(bridge.download).toHaveBeenCalledOnce());
  send({ stage: "downloading", percent: 42 });
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("42");
});
it("saves before restarting and refuses restart when saving fails", async () => {
  const { bridge } = setup("ready");
  const before = vi
    .fn()
    .mockRejectedValueOnce(new Error("Save failed. Draft preserved."))
    .mockResolvedValue(undefined);
  render(<DesktopUpdates beforeRestart={before} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Restart and update" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Draft preserved",
  );
  expect(bridge.install).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Restart and update" }));
  await waitFor(() => expect(bridge.install).toHaveBeenCalledOnce());
  expect(before).toHaveBeenCalledTimes(2);
});
it("restores dismissed update feedback when the user checks again", async () => {
  const { send } = setup("current");
  render(<DesktopUpdates beforeRestart={async () => {}} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Dismiss update message" }),
  );
  expect(screen.queryByRole("region", { name: "App update" })).toBeNull();
  send({ stage: "checking" });
  send({ stage: "current" });
  expect(screen.getByText(/You're up to date/)).toBeTruthy();
});
it("does not show a desktop update control in the web companion", () => {
  render(<DesktopUpdates beforeRestart={async () => {}} />);
  expect(screen.queryByRole("region", { name: "App update" })).toBeNull();
});

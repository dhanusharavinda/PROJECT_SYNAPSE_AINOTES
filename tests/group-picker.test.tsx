// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GroupPicker from "../src/GroupPicker";
afterEach(cleanup);
it("lists existing groups and reassigns an existing page", () => {
  const change = vi.fn();
  render(
    <GroupPicker
      value="Physics"
      groups={["Physics", "Math", "Math"]}
      onChange={change}
    />,
  );
  expect(screen.getAllByRole("option", { name: "Math" })).toHaveLength(1);
  const option = screen.getByRole("option", {
    name: "Math",
  }) as HTMLOptionElement;
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: option.value },
  });
  expect(change).toHaveBeenCalledWith("Math");
});
it("creates a named group without sending empty invalid values", () => {
  const change = vi.fn();
  render(<GroupPicker value="Unsorted" groups={[]} onChange={change} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "new" } });
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "  Revision  " },
  });
  expect(change).toHaveBeenLastCalledWith("Revision");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  expect(change).not.toHaveBeenCalledWith("");
  fireEvent.blur(screen.getByRole("textbox"));
  expect(change).toHaveBeenLastCalledWith("Unsorted");
});
it("disables group reassignment for a shared viewer or locked field", () => {
  render(
    <GroupPicker
      value="Physics"
      groups={["Math"]}
      onChange={() => {}}
      disabled
      cell="group"
    />,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
    true,
  );
  expect(screen.getByRole("combobox").getAttribute("data-cell")).toBe("group");
});

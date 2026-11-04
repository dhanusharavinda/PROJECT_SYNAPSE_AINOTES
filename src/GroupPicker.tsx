import { useState } from "react";

export default function GroupPicker({
  value,
  groups,
  onChange,
  disabled = false,
  cell,
}: {
  value: string;
  groups: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  cell?: string;
}) {
  const [creating, setCreating] = useState(false);
  const options = [
    ...new Set(
      ["Unsorted", value, ...groups].map((g) => g.trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  return (
    <>
      <select
        aria-label="Topic group"
        data-cell={cell}
        disabled={disabled}
        value={
          creating ? "new" : String(options.indexOf(value.trim() || "Unsorted"))
        }
        onChange={(e) => {
          if (e.target.value === "new") setCreating(true);
          else {
            setCreating(false);
            onChange(options[Number(e.target.value)]);
          }
        }}
      >
        {options.map((group, index) => (
          <option key={group} value={index}>
            {group}
          </option>
        ))}
        <option value="new">New group...</option>
      </select>
      {creating && (
        <input
          aria-label="New group name"
          data-cell={cell}
          disabled={disabled}
          maxLength={100}
          placeholder="Group name"
          autoFocus
          defaultValue=""
          onChange={(e) => {
            if (e.target.value.trim()) onChange(e.target.value.trim());
          }}
          onBlur={(e) => onChange(e.target.value.trim() || "Unsorted")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
              setCreating(false);
            }
          }}
        />
      )}
    </>
  );
}

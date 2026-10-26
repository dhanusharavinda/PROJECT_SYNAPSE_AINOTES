export function displayMarkdown(text: string) {
  return text.replace(
    /\]\(\.\.\/(attachments|drawings)\/([-a-zA-Z0-9.]+)\)/g,
    "](/files/$1/$2)",
  );
}
export function storageMarkdown(text: string) {
  return text.replace(
    /\]\(\/files\/(attachments|drawings)\/([-a-zA-Z0-9.]+)\)/g,
    "](../$1/$2)",
  );
}

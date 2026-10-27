export function displayMarkdown(text: string) {
  return text.replace(/(\]\()\.\.\/(attachments|drawings)\//g, "$1/files/$2/");
}
export function storageMarkdown(text: string) {
  return text
    .replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?=\/files\/)/g, "")
    .replace(
      /(\/files\/(?:attachments|drawings)\/[a-zA-Z0-9._-]+)\?access=[a-f0-9]+/g,
      "$1",
    )
    .replace(/(\]\()\/files\/(attachments|drawings)\//g, "$1../$2/");
}

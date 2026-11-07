export async function saveCodeFile(code: string, language?: string) {
  const languages = await import("linguist-languages");
  const label = language?.toLowerCase();
  const entries: {
    name: string;
    aliases?: readonly string[];
    extensions?: readonly string[];
    filenames?: readonly string[];
  }[] = Object.values(languages);
  const exact = entries.find((entry) => entry.name.toLowerCase() === label);
  const alias = entries.find((entry) =>
    entry.aliases?.some((value) => value.toLowerCase() === label),
  );
  const extensionMatch = entries.find((entry) =>
    entry.extensions?.some(
      (extension) => extension.toLowerCase() === `.${label}`,
    ),
  );
  const matched = exact ?? alias ?? extensionMatch;
  const extension =
    (exact ?? alias)?.extensions?.[0] ??
    extensionMatch?.extensions?.find(
      (value) => value.toLowerCase() === `.${label}`,
    ) ??
    matched?.extensions?.[0];
  const filename = extension
    ? `file${extension}`
    : (matched?.filenames?.[0] ?? "file.txt");
  const url = URL.createObjectURL(
    new Blob([code], { type: "text/plain;charset=utf-8" }),
  );
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

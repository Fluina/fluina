import { $ } from "bun";

const versionType = process.argv[2] || "patch";
const validTypes = ["patch", "minor", "major"];

if (!validTypes.includes(versionType)) {
  console.error(
    `❌ エラー: 引数は ${validTypes.join(", ")} のいずれかを指定してください。`,
  );
  process.exit(1);
}

try {
  const packageJson: unknown = JSON.parse(
    await Bun.file("package.json").text(),
  );
  if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    !("version" in packageJson) ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error("package.json に有効なバージョンがありません。");
  }

  const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);
  if (!versionMatch) {
    throw new Error(
      `バージョン ${packageJson.version} は patch/minor/major 更新に対応していません。`,
    );
  }

  const [major, minor, patch] = versionMatch.slice(1).map(Number);
  const nextVersion =
    versionType === "major"
      ? `${major + 1}.0.0`
      : versionType === "minor"
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`;
  const tagPrefix = (await $`npm config get tag-version-prefix`).text().trim();
  const nextTag = `${tagPrefix}${nextVersion}`;
  const existingTag = (await $`git tag --list ${nextTag}`).text().trim();

  if (existingTag) {
    throw new Error(
      `タグ ${nextTag} はすでに存在します。package.json のバージョンを確認してください。`,
    );
  }

  console.log("🎨 1. Biomeでコードを整形・チェックしています...");
  await $`bunx @biomejs/biome check --write --unsafe .`;

  console.log("📦 2. 変更をGitにステージングしています...");
  await $`git add .`;

  const status = await $`git status --porcelain`.text();
  if (status.trim() !== "") {
    console.log("📝 3. 整形結果をコミットしています...");
    await $`git commit -m "chore: apply biome formatting"`;
  } else {
    console.log("⏩ 変更がないためコミットをスキップします。");
  }

  console.log(
    `🚀 4. バージョンを更新し、タグを作成しています (${versionType})...`,
  );
  await $`npm version ${versionType}`;

  console.log("☁️ 5. リモートリポジトリにプッシュしています...");
  await $`git push origin HEAD`;
  await $`git push origin --tags`;

  console.log("✅ すべての作業が完了しました！");
} catch (error) {
  console.error("❌ 実行中に予期せぬエラーが発生しました:", error);
  process.exit(1);
}

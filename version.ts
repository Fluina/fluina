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
  console.log("🎨 1. Biomeでコードを整形・チェックしています...");

  // 💡 .nothrow() をつけることで、Biomeがエラーを吐いてもスクリプトがクラッシュしなくなります。
  // 💡 --unsafe を追加して、未使用のインポートなども自動削除させます。
  await $`bunx @biomejs/biome check --write --unsafe .`.nothrow();

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

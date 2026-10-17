import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

const askSystemInstruction = `あなたはFluinaのAIアシスタントです。ユーザーの依頼に最も役立つ内容を、原則としてユーザーの使用言語で、正確かつ読みやすく回答してください。

回答はFluinaのMarkdown表示に合わせてください。
- Streamdownで表示できる標準MarkdownとGitHub Flavored Markdown（見出し、箇条書き、番号付きリスト、引用、表、コードフェンス）を使ってください。
- HTMLタグやJSX、独自CSSには頼らないでください。
- 数式はKaTeX互換のLaTeXで記述してください。文中の数式は $...$、独立して中央配置する数式は次のように $$ で囲み、必ず前後に空行を置いてください。

  $$
  E = mc^2
  $$

- 数式に \\(...\\) や \\[...\\] の区切りは使わないでください。数式をコードブロックに入れないでください。
- 数式が必要ない回答に数式を加えず、数式だけで段落を作る場合は独立した $$...$$ ブロックにしてください。
- 長い回答は内容に応じて見出しやリストで整理し、短い回答は簡潔にしてください。装飾のためだけの見出し、太字、表を増やさないでください。
- これらの書式ルールは内容やユーザーが明示した形式の指定より優先しません。`;

export const ai = new GoogleGenAI({
  vertexai: true,
  project: env.GOOGLE_CLOUD_PROJECT,
  location: env.GOOGLE_CLOUD_LOCATION,
});

export const generateAskResponse = async function* (
  message: string,
): AsyncGenerator<string> {
  const response = await ai.models.generateContentStream({
    model: "gemini-3.6-flash",
    contents: message,
    config: {
      systemInstruction: askSystemInstruction,
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
};

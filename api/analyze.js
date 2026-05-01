import Anthropic from "@anthropic-ai/sdk";

const PROMPT = [
  "이 사진에서 학원, 교습소, 개인과외교습소의 공식 상호명을 찾아주세요.",
  "규칙:",
  "- 간판이나 현수막에 적힌 공식 명칭만 추출",
  "- '학원', '교습소' 등 기관 종류명 포함",
  "- 이름만 한 줄로 답변 (예: 하남수학학원)",
  "- 파일명으로 쓸 수 없는 특수문자(/ \\ : * ? \" < > |)는 제외",
  "- 확인 불가능하면 '알수없음' 으로만 답변",
].join("\n");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: "imageBase64, mimeType 필요" });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 80,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: imageBase64 },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const raw = resp.content[0].text.trim();
    const name = raw.replace(/[\\/:*?"<>|]/g, "");
    return res.json({ name: name === "알수없음" ? "" : name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

import { GoogleGenAI } from "@google/genai";

export async function generateAppLogo() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: "Professional minimalist app icon for a rewards app named 'RewardHub'. The logo should feature a modern, stylized letter 'R' combined with a shining golden coin. Use a vibrant purple background with golden yellow accents. High quality, 3D render style, flat design, centered, square aspect ratio, high resolution.",
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

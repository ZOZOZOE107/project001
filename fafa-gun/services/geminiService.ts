import { GoogleGenAI, Type } from "@google/genai";
import { GameConfig } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const DEFAULT_CONFIG: GameConfig = {
  name: "Classic Mode",
  spawnRate: 800,
  minSpeed: 2,
  maxSpeed: 5,
  targetSize: 40,
  colors: ["#EF4444", "#3B82F6", "#10B981", "#F59E0B"],
  gravity: 0.1,
  description: "Standard balanced gameplay.",
  shape: 'circle',
};

export const generateLevelConfig = async (prompt: string): Promise<GameConfig> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a configuration for a rhythm/reflex game where targets pop up on screen based on this request: "${prompt}".
      
      Parameters explanation:
      - spawnRate: milliseconds between new targets (lower is faster). Range 200-2000.
      - minSpeed/maxSpeed: speed of targets. Range 1-15.
      - targetSize: radius in pixels. Range 20-80.
      - gravity: downward pull. 0 for floating, >0 for falling.
      - colors: array of hex codes.
      - shape: 'circle' or 'heart'.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            spawnRate: { type: Type.NUMBER },
            minSpeed: { type: Type.NUMBER },
            maxSpeed: { type: Type.NUMBER },
            targetSize: { type: Type.NUMBER },
            gravity: { type: Type.NUMBER },
            colors: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            shape: { type: Type.STRING, enum: ['circle', 'heart'] },
          },
          required: ["name", "spawnRate", "minSpeed", "maxSpeed", "targetSize", "colors", "gravity", "description", "shape"],
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as GameConfig;
    }
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error("Failed to generate level with Gemini:", error);
    return DEFAULT_CONFIG;
  }
};
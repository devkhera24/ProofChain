import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";
import { callAi } from "./common.js";

let client;
export const getClient = () => (client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));

export const GEMINI_INFO = { service: "Gemini", model: env.GEMINI_MODEL, modelVar: "GEMINI_MODEL", keyVar: "GEMINI_API_KEY" };
export const GEMINI_EMBED_INFO = { service: "Gemini", model: env.GEMINI_EMBED_MODEL, modelVar: "GEMINI_EMBED_MODEL", keyVar: "GEMINI_API_KEY" };

/** One Gemini generation; returns the text. `json` asks for a JSON response. */
export async function geminiComplete({ task, system, prompt, json = false, temperature }) {
  const res = await callAi(
    task,
    () =>
      getClient().models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: { systemInstruction: system, temperature, ...(json && { responseMimeType: "application/json" }) },
      }),
    GEMINI_INFO,
  );
  return res.text ?? "";
}

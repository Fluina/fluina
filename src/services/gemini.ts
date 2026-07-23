import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

export const ai = new GoogleGenAI({
    vertexai: true,
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.GOOGLE_CLOUD_LOCATION
});

export const generateAskResponse = async (message: string) => {
    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: message,
    });

    return response.text;
};
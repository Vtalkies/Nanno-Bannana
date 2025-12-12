import { GoogleGenAI } from "@google/genai";
import { GenerationConfig } from "../types";

/**
 * Generate a new image from scratch using a text prompt.
 */
export const generateImage = async (
  prompt: string,
  config: GenerationConfig
): Promise<string> => {
  // Instantiate per request to ensure correct API key is used
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const modelName = config.modelTier === 'pro' 
    ? 'gemini-3-pro-image-preview' 
    : 'gemini-2.5-flash-image';

  // Construct image configuration
  const imageConfig: any = {
    aspectRatio: config.aspectRatio,
  };

  // Only Pro supports explicit resolution setting
  if (config.modelTier === 'pro' && config.resolution) {
    imageConfig.imageSize = config.resolution;
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig,
      },
    });

    return extractImageFromResponse(response);
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

/**
 * Edit an existing image using a text prompt and the image itself.
 * This ensures character consistency by using the previous frame as reference.
 */
export const editImage = async (
  base64Image: string,
  prompt: string,
  config: GenerationConfig
): Promise<string> => {
  // Instantiate per request to ensure correct API key is used
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const modelName = config.modelTier === 'pro' 
    ? 'gemini-3-pro-image-preview' 
    : 'gemini-2.5-flash-image';

  const imageConfig: any = {
    aspectRatio: config.aspectRatio,
  };

  if (config.modelTier === 'pro' && config.resolution) {
    imageConfig.imageSize = config.resolution;
  }

  try {
    // Clean base64 string if it contains data URI header
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: 'image/png', // Gemini accepts generic image types
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig,
      },
    });

    return extractImageFromResponse(response);
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};

const extractImageFromResponse = (response: any): string => {
  if (!response.candidates || response.candidates.length === 0) {
    throw new Error("No candidates returned from Gemini.");
  }

  const parts = response.candidates[0].content.parts;
  for (const part of parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  // If we only got text back (sometimes happens on error or refusal)
  const textPart = parts.find((p: any) => p.text);
  if (textPart) {
    throw new Error(`Model returned text instead of image: ${textPart.text}`);
  }

  throw new Error("No image data found in response.");
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};
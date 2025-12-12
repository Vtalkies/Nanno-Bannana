import { GoogleGenAI } from "@google/genai";
import { GenerationConfig } from "../types";

const constructPrompt = (prompt: string, config: GenerationConfig): string => {
  const parts = [];
  
  // Style prefix
  if (config.style && config.style !== 'None') {
    parts.push(`${config.style} style.`);
  }

  // The core prompt
  parts.push(prompt);

  // Photographic suffixes
  if (config.photographic) {
    const { lighting, camera, depth } = config.photographic;
    if (lighting && lighting !== 'None') parts.push(`Lighting: ${lighting}.`);
    if (camera && camera !== 'None') parts.push(`Camera Angle: ${camera}.`);
    if (depth && depth !== 'None') parts.push(`Depth of Field: ${depth}.`);
  }

  // Consistency Instruction
  if (config.consistencyStrength) {
    switch (config.consistencyStrength) {
      case 'High':
        parts.push("IMPORTANT: Strictly preserve the identity, facial features, and visual details of the character(s) in the reference images.");
        break;
      case 'Medium':
        parts.push("Maintain the general likeness and key visual traits of the character(s) in the reference images.");
        break;
      case 'Low':
        parts.push("Use the reference images as loose inspiration for the character's appearance, allowing for creative variations.");
        break;
    }
  }

  return parts.join(' ');
};

/**
 * Generate a new image from scratch using a text prompt and optional reference images.
 */
export const generateImage = async (
  prompt: string,
  config: GenerationConfig,
  referenceImages: string[] = []
): Promise<string> => {
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

  const requestConfig: any = {
    imageConfig,
  };

  if (config.modelTier === 'pro' && config.useGrounding) {
    requestConfig.tools = [{ google_search: {} }];
  }

  const finalPrompt = constructPrompt(prompt, config);
  
  // Build request parts
  const parts: any[] = [];
  
  // Add reference images if any (Blend mode)
  referenceImages.forEach(base64 => {
    const cleanBase64 = base64.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
    parts.push({
      inlineData: {
        data: cleanBase64,
        mimeType: 'image/png'
      }
    });
  });

  // Add text prompt
  parts.push({ text: finalPrompt });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts,
      },
      config: requestConfig,
    });

    return extractImageFromResponse(response);
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

/**
 * Edit an existing image using a text prompt and the image itself.
 */
export const editImage = async (
  base64Image: string,
  prompt: string,
  config: GenerationConfig
): Promise<string> => {
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

  const requestConfig: any = {
    imageConfig,
  };

  if (config.modelTier === 'pro' && config.useGrounding) {
    requestConfig.tools = [{ google_search: {} }];
  }

  const finalPrompt = constructPrompt(prompt, config);

  try {
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: 'image/png',
            },
          },
          {
            text: finalPrompt,
          },
        ],
      },
      config: requestConfig,
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
import { GoogleGenAI } from "@google/genai";
import { GenerationConfig } from "../types";

const constructPrompt = (prompt: string, config: GenerationConfig): string => {
  const parts = [];
  
  // 1. CRITICAL: CAMERA / SPATIAL SETUP
  // This must be first to set the "scene stage" before actors (characters) are placed.
  if (config.cameraDescription) {
    parts.push(`
    ★ MANDATORY CAMERA SETUP:
    ${config.cameraDescription}
    INSTRUCTION: You must strictly adhere to this camera perspective. If the user's text prompt implies a different angle, IGNORE the text prompt's angle and use this Camera Setup instead.
    `);
  } else if (config.sketchPerspective && config.sketchPerspective !== 'None') {
    parts.push(`CAMERA PERSPECTIVE: ${config.sketchPerspective}.`);
  }

  // 2. SKETCH GUIDE INSTRUCTION
  if (config.sketchImage) {
    parts.push(`
    STRUCTURE GUIDE:
    The first image provided is a structural sketch. Use it as a STRICT COMPOSITION GUIDE. 
    Enhance this sketch into a fully rendered, high-quality image, maintaining the exact placement of elements.
    `);
  }

  // 3. STYLE & ATMOSPHERE
  if (config.style && config.style !== 'None') {
    parts.push(`STYLE: ${config.style}.`);
  }
  if (config.photographic) {
    const { lighting, camera, depth } = config.photographic;
    if (lighting && lighting !== 'None') parts.push(`LIGHTING: ${lighting}.`);
    if (camera && camera !== 'None') parts.push(`LENS TYPE: ${camera}.`);
    if (depth && depth !== 'None') parts.push(`DEPTH OF FIELD: ${depth}.`);
  }

  // 4. CORE NARRATIVE (User Prompt)
  parts.push(`
  SCENE DESCRIPTION:
  ${prompt}
  `);

  // 5. CHARACTER HANDLING
  if (config.characterNames && config.characterNames.length > 0) {
    const names = config.characterNames.join(", ");
    parts.push(`CHARACTERS PRESENT: ${names}.`);
    
    // CRITICAL: Decouple reference pose from output pose
    parts.push(`
    IMPORTANT FOR CHARACTERS:
    - Use the provided reference images ONLY to determine the character's facial features, hair, and clothing details.
    - DO NOT copy the pose, head angle, or camera distance from the reference images.
    - The character's pose and angle must be derived strictly from the "MANDATORY CAMERA SETUP" and "SCENE DESCRIPTION".
    `);
    
    if (config.characterNames.length > 1) {
      parts.push("Ensure each character is distinct and positioned according to the description.");
    }
  }

  // 6. PHYSICS & CONSISTENCY
  if (config.enhancePhysics) {
    parts.push("PHYSICS: Ensure precise physical interaction. Hands must actively grip objects with visible tension. Objects on ground must have weight. Gravity must be realistic.");
  }

  if (config.consistencyStrength) {
    switch (config.consistencyStrength) {
      case 'High':
        parts.push("CONSISTENCY: Strictly preserve the identity/face of the characters.");
        break;
      case 'Medium':
        parts.push("CONSISTENCY: Maintain general character likeness.");
        break;
      case 'Low':
        parts.push("CONSISTENCY: Use reference images as loose inspiration.");
        break;
    }
  }

  return parts.join('\n');
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

  // 1. Add Sketch Image FIRST if present (Critical for structural guidance)
  if (config.sketchImage) {
    const cleanSketch = config.sketchImage.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
    parts.push({
      inlineData: {
        data: cleanSketch,
        mimeType: 'image/png'
      }
    });
  }
  
  // 2. Add other reference images (Character refs / Style refs)
  referenceImages.forEach(base64 => {
    const cleanBase64 = base64.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
    parts.push({
      inlineData: {
        data: cleanBase64,
        mimeType: 'image/png'
      }
    });
  });

  // 3. Add text prompt
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
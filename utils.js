import { Redis } from "@upstash/redis";
export async function extractIngredientName(input) {
  const prompt = `
    Extract the main ingredient name from the following ingredient description:
    "${input}"

    Respond with ONLY the single main ingredient name, nothing else. If there are multiple ingredients, choose the most prominent one.
  `;

  try {
    const response = await callLLM(prompt);
    console.log("LLM response:", response);
    return response.trim();
  } catch (error) {
    console.error("Error extracting ingredient name:", error);
    return normalizeIngredient(input);
  }
}

export function getRedisClient() {
  const client = new Redis({
    url: process.env.REDIS_URL || "",
    token: process.env.REDIS_TOKEN || "",
  });

  return client;
}

export function normalizeIngredient(ingredient) {
  return ingredient
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\b(s|es)$/, "") // Remove trailing 's' or 'es'
    .trim();
}

export async function callLLM(prompt) {
  const response = await fetch(
    "https://api.deepinfra.com/v1/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEP_INFRA_API_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  return content;
}

export async function callLLMJson(prompt) {
  const response = await fetch(
    "https://api.deepinfra.com/v1/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEP_INFRA_API_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that must respond only with valid JSON. Do not include any other text or formatting.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Ensure the content is valid JSON
  try {
    JSON.parse(content);
    return content;
  } catch (error) {
    console.error("LLM returned invalid JSON:", content);
    throw error;
  }
}

export async function getNutritionInfo(ingredient) {
  console.log(`Getting nutrition info for: ${ingredient}`);
  const prompt = `
    Provide the nutritional information for 100 grams of ${ingredient}.
    Return only a JSON object with the following properties:
    {
      "calories": number,
      "protein": number (in grams),
      "fat": number (in grams),
      "carbohydrates": number (in grams)
    }
    Do not include any explanations or additional text.
  `;

  try {
    console.log("Calling LLM for nutrition info");
    const response = await callLLMJson(prompt);
    console.log("LLM response:", JSON.stringify(response));

    // Parse the JSON string into an object
    const parsedResponse = JSON.parse(response);
    console.log("Parsed response:", JSON.stringify(parsedResponse));

    if (isNutritionInfo(parsedResponse)) {
      console.log("Valid nutrition info received");
      return parsedResponse;
    }
    console.error(
      "Invalid nutrition info format:",
      JSON.stringify(parsedResponse)
    );
    throw new Error("Invalid nutrition info format");
  } catch (error) {
    console.error(`Error getting nutrition info for ${ingredient}:`, error);
    return {
      calories: 0,
      protein: 0,
      fat: 0,
      carbohydrates: 0,
    };
  }
}

// Update the type guard function
function isNutritionInfo(obj) {
  console.log(
    "Checking if object is valid nutrition info:",
    JSON.stringify(obj)
  );
  const isValid =
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.calories === "number" &&
    typeof obj.protein === "number" &&
    typeof obj.fat === "number" &&
    typeof obj.carbohydrates === "number";
  console.log("Is valid nutrition info:", isValid);
  return isValid;
}

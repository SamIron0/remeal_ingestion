const { Redis } = require("@upstash/redis");

async function extractIngredientInfo(input) {
  const prompt = `
    Extract the quantity, unit (if present), and main ingredient name from the following ingredient description:
    "${input}"

    Respond with a JSON object containing the following properties:
    {
      "quantity": number or fraction (as string),
      "unit": string (or null if not present),
      "name": string (main ingredient name)
    }
    Do not include any explanations or additional text.
  `;

  try {
    const response = await callLLMJson(prompt);
    return JSON.parse(response);
  } catch (error) {
    console.error("Error extracting ingredient info:", error);
    return {
      quantity: "1",
      unit: null,
      name: normalizeIngredient(input),
    };
  }
}

function getRedisClient() {
  const client = Redis.fromEnv();
  return client;
}

function normalizeIngredient(ingredient) {
  return ingredient
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\b(s|es)$/, "") // Remove trailing 's' or 'es'
    .trim();
}

async function callLLM(prompt, model = "meta-llama/Meta-Llama-3.1-70B-Instruct") {
  const response = await fetch(
    "https://api.deepinfra.com/v1/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEP_INFRA_API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
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

async function callLLMJson(prompt, model = "meta-llama/Meta-Llama-3.1-70B-Instruct") {
  const response = await fetch(
    "https://api.deepinfra.com/v1/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEP_INFRA_API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
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

async function getNutritionInfo(ingredient) {
  console.log(`Getting nutrition info for: ${ingredient}`);
  const prompt = `
    Provide the nutritional information for 100 grams of ${ingredient}.
    Return only a SINGLE JSON object with the following properties:
    {
      "calories": number,
      "protein": number (in grams),
      "fat": number (in grams),
      "carbohydrates": number (in grams)
    }
    Do not include any explanations, additional text, or arrays. Return ONLY ONE JSON object.
  `;

  try {
    const response = await callLLMJson(prompt);

    // Parse the JSON string into an object
    const parsedResponse = JSON.parse(response);

    if (isNutritionInfo(parsedResponse)) {
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
  const isValid =
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.calories === "number" &&
    typeof obj.protein === "number" &&
    typeof obj.fat === "number" &&
    typeof obj.carbohydrates === "number";
  return isValid;
}

// Replace export statements with module.exports
module.exports = {
  extractIngredientInfo,
  getRedisClient,
  normalizeIngredient,
  callLLM,
  callLLMJson,
  getNutritionInfo,
};

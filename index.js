require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const { extractIngredientInfo, callLLM } = require("./utils"); // Assume this is implemented
const { normalizeIngredient, getNutritionInfo } = require("./utils"); // Assume these are implemented
async function ingestRecipe(recipeData) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const recipeId = await insertRecipe(supabase, recipeData);
    await indexRecipe(supabase, recipeId, recipeData.ingredients, recipeData);

    return { success: true, recipeId };
  } catch (error) {
    console.error("Error in recipe ingestion:", error);
    return { success: false, error: error.message };
  }
}

async function insertRecipe(supabase, recipeData) {
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      name: recipeData.name,
      instructions: recipeData.instructions,
      description: recipeData.description,
      cook_time: recipeData.cook_time,
      prep_time: recipeData.prep_time,
      servings: recipeData.servings,
      user_id: null, // Assuming this is set to null for admin-created recipes
    })
    .select();

  if (error) {
    console.error("Error inserting recipe:", error);
    throw new Error(`Error inserting recipe: ${error.message}`);
  }

  const recipeId = data[0].id;

  return recipeId;
}

async function indexRecipe(supabase, recipeId, ingredients, recipeData) {
  const ingredientData = await Promise.all(
    ingredients.map(async (ingredient) => {
      const { quantity, unit, name } = await extractIngredientInfo(ingredient);
      const normalizedName = normalizeIngredient(name);
      const nutritionInfo = await getNutritionInfo(normalizedName);
      const convertedQuantity = await convertToStandardUnit(
        quantity,
        unit,
        name
      );
      return {
        extractedName: name,
        normalizedName,
        nutritionInfo,
        originalQuantity: quantity,
        originalUnit: unit,
        convertedQuantity,
        unit: "g",
      };
    })
  );

  await Promise.all(
    ingredientData.map((data) => indexIngredient(supabase, recipeId, data))
  );
  const totalNutrition = calculateTotalNutrition(
    ingredientData,
    recipeData.servings
  );
  await updateRecipeNutrition(supabase, recipeId, totalNutrition);
}

async function indexIngredient(
  supabase,
  recipeId,
  {
    extractedName,
    nutritionInfo,
    originalQuantity,
    originalUnit,
    convertedQuantity,
  }
) {
  const { error } = await supabase.rpc("index_ingredient", {
    p_recipe_id: recipeId,
    p_ingredient: extractedName,
    p_quantity: parseQuantity(originalQuantity),
    p_unit: originalUnit || "",
    p_converted_quantity: convertedQuantity,
    p_calories: nutritionInfo?.calories || 0,
    p_protein: nutritionInfo?.protein || 0,
    p_fat: nutritionInfo?.fat || 0,
    p_carbohydrates: nutritionInfo?.carbohydrates || 0,
  });

  if (error)
    throw new Error(
      `Error in index_ingredient for ${extractedName}: ${error.message}`
    );
}

function calculateTotalNutrition(ingredientData, servings) {
  const total = ingredientData.reduce(
    (total, { nutritionInfo, convertedQuantity }) => {
      const factor = convertedQuantity / 100;
      return {
        calories: total.calories + (nutritionInfo?.calories || 0) * factor,
        protein: total.protein + (nutritionInfo?.protein || 0) * factor,
        fat: total.fat + (nutritionInfo?.fat || 0) * factor,
        carbohydrates:
          total.carbohydrates + (nutritionInfo?.carbohydrates || 0) * factor,
      };
    },
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0 }
  );

  // Divide by the number of servings and round the values
  return {
    calories: Math.round(total.calories / servings),
    protein: +(total.protein / servings).toFixed(2),
    fat: +(total.fat / servings).toFixed(2),
    carbohydrates: +(total.carbohydrates / servings).toFixed(2),
  };
}

async function updateRecipeNutrition(supabase, recipeId, totalNutrition) {
  const { error } = await supabase.from("nutrition_info").upsert(
    {
      recipe_id: recipeId,
      ...totalNutrition,
    },
    { onConflict: "recipe_id" }
  );

  if (error)
    throw new Error(
      `Error updating nutrition info for recipe ${recipeId}: ${error.message}`
    );
}

function parseQuantity(quantityString) {
  if (quantityString == null) {
    return null;
  }
  if (quantityString.includes("/")) {
    const [numerator, denominator] = quantityString.split("/");
    return parseFloat(numerator) / parseFloat(denominator);
  }
  const parsedValue = parseFloat(quantityString);
  return isNaN(parsedValue) ? null : parsedValue;
}

async function convertToStandardUnit(quantity, unit, ingredient) {
  if (quantity == null) {
    return 0;
  }
  const prompt = `
    Convert ${quantity} ${unit ? unit : ""} ${ingredient} to grams.
    Respond with only a number representing the equivalent weight in grams, rounded.
  `;

  try {
    const response = await callLLM(prompt);
    const convertedQuantity = parseInt(response.trim(), 10);
    return isNaN(convertedQuantity) ? 0 : convertedQuantity;
  } catch (error) {
    console.error(`Error converting ${ingredient} to standard unit:`, error);
    return 0; // Default to 100g if conversion fails
  }
}

module.exports = { ingestRecipe };

const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const { getRedisClient } = require("./redisClient"); // Assume this is implemented
const { extractIngredientName, normalizeIngredient, getNutritionInfo } = require("./ingredientUtils"); // Assume these are implemented

exports.handler = async (event, context) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    console.log("Received POST request in recipe_ingestion");
    const recipeData = JSON.parse(event.body);
    console.log("Received recipe data:", recipeData);

    const supabase = createClient(supabaseUrl, supabaseKey);
    const recipeId = await insertRecipe(supabase, recipeData);
    await indexRecipe(supabase, recipeId, recipeData.ingredients);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Recipe ingestion successful" }),
    };
  } catch (error) {
    console.error("Error in recipe_ingestion POST:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

async function insertRecipe(supabase, recipeData) {
  console.log("Inserting recipe into database");
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

  if (error) throw new Error(`Error inserting recipe: ${error.message}`);

  console.log("Recipe inserted successfully:", data);
  return data[0].id;
}

async function indexRecipe(supabase, recipeId, ingredients) {
  console.log(`Starting indexRecipe for recipeId: ${recipeId}`);
  const redis = getRedisClient();

  const ingredientData = await Promise.all(
    ingredients.map(async (ingredient) => {
      const extractedName = await extractIngredientName(ingredient);
      const normalizedName = normalizeIngredient(extractedName);
      const nutritionInfo = await getNutritionInfo(normalizedName);
      return { extractedName, normalizedName, nutritionInfo };
    })
  );

  await Promise.all(ingredientData.map(data => 
    indexIngredient(supabase, redis, recipeId, data)
  ));

  const totalNutrition = calculateTotalNutrition(ingredientData);
  await updateRecipeNutrition(supabase, recipeId, totalNutrition);

  console.log(`Finished indexRecipe for recipeId: ${recipeId}`);
}

async function indexIngredient(supabase, redis, recipeId, { extractedName, nutritionInfo }) {
  console.log(`Processing ingredient: ${extractedName}`);

  const { error } = await supabase.rpc("index_ingredient", {
    p_recipe_id: recipeId,
    p_ingredient: extractedName,
    p_quantity: 1, // Default quantity, adjust as needed
    p_unit: "", // Default empty unit, adjust as needed
    p_calories: nutritionInfo?.calories || 0,
    p_protein: nutritionInfo?.protein || 0,
    p_fat: nutritionInfo?.fat || 0,
    p_carbohydrates: nutritionInfo?.carbohydrates || 0,
  });

  if (error) throw new Error(`Error in index_ingredient for ${extractedName}: ${error.message}`);

  await updateRedis(redis, extractedName, recipeId);
}

async function updateRedis(redis, ingredient, recipeId) {
  const existingRecipes = await redis.get(ingredient);
  const newValue = existingRecipes ? `${existingRecipes},${recipeId}` : `${recipeId}`;
  await redis.set(ingredient, newValue);
  console.log(`Updated Redis for ingredient: ${ingredient}`);
}

function calculateTotalNutrition(ingredientData) {
  return ingredientData.reduce(
    (total, { nutritionInfo }) => ({
      calories: total.calories + (nutritionInfo?.calories || 0),
      protein: total.protein + (nutritionInfo?.protein || 0),
      fat: total.fat + (nutritionInfo?.fat || 0),
      carbohydrates: total.carbohydrates + (nutritionInfo?.carbohydrates || 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0 }
  );
}

async function updateRecipeNutrition(supabase, recipeId, totalNutrition) {
  const { error } = await supabase
    .from("nutrition_info")
    .upsert(
      {
        recipe_id: recipeId,
        ...totalNutrition,
      },
      { onConflict: "recipe_id" }
    );

  if (error) throw new Error(`Error updating nutrition info for recipe ${recipeId}: ${error.message}`);
  console.log(`Successfully updated nutrition info for recipe ${recipeId}`);
}


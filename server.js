const express = require('express');
const bodyParser = require('body-parser');
const { ingestRecipe } = require('./index');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post('/ingest', async (req, res) => {
  try {
    const recipeData = req.body;
    const result = await ingestRecipe(recipeData);
    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

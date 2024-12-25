# Recipe Ingestion Microservice

This microservice is responsible for ingesting and processing recipe data for the Remeal application. It handles the insertion of new recipes into the database, including ingredient indexing and nutrition information calculation.

## Features

- Recipe data ingestion and storage
- Ingredient extraction and normalization
- Nutrition information calculation
- Ingredient indexing for efficient recipe search

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:
   Create a `.env.local` file in the root directory and add the necessary environment variables (refer to `.env.example`).

## Usage

To start the server:

```bash
npm start
```

The server will run on `http://localhost:3000` by default.

## API Endpoints

### POST /ingest

Ingests a new recipe into the system.

Request body:

```json
{
    "name": "Recipe Name",
    "ingredients": ["ingredient 1", "ingredient 2", ...],
    "instructions": ["step 1", "step 2", ...],
    "description": "Recipe description",
    "cook_time": 30,
    "prep_time": 15,
    "servings": 4
}
```

Response:

```json
{
  "success": true,
  "message": "Recipe ingested successfully"
}
```

## License

This project is licensed under the ISC License.

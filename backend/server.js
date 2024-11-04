const express = require("express");
const { Client } = require("@elastic/elasticsearch");
const cors = require("cors");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

const client = new Client({
  node: "https://my-elasticsearch-project-cd51f7.es.us-east-1.aws.elastic.cloud:443",
  auth: {
    apiKey: "V1RZSDdwSUJiamVRWkF3Q29pT1c6LU1UdnUxbVFSV2FVUUhyUWpva0h1QQ==",
  },
});

const INDEX_NAME = "medicines";

// Function to check if Elasticsearch is running
async function checkElasticsearch() {
  try {
    await client.ping();
    console.log("Elasticsearch is running");
    return true;
  } catch (error) {
    console.error("Elasticsearch cluster is down:", error);
    return false;
  }
}

// Function to create index and mapping
async function createIndex() {
  try {
    const exists = await client.indices.exists({ index: INDEX_NAME });
    console.log(`Index ${INDEX_NAME} exists:`, exists);

    if (exists) {
      console.log("Index already exists, deleting...");
      await client.indices.delete({ index: INDEX_NAME });
      console.log("Index deleted successfully");
    }

    await client.indices.create({
      index: INDEX_NAME,
      body: {
        mappings: {
          properties: {
            name: { type: "text" },
            generic_name: { type: "text" },
            manufacturer: { type: "keyword" },
            category: { type: "keyword" },
            price: { type: "float" },
            dosage: { type: "keyword" },
            description: { type: "text" },
            name_suggest: {
              type: "completion",
            },
          },
        },
      },
    });
    console.log("Index created successfully");
    return true;
  } catch (error) {
    console.error("Error creating index:", error);
    return false;
  }
}

// Function to read and parse CSV file
async function readCSVFile() {
  return new Promise((resolve, reject) => {
    const medicines = [];
    fs.createReadStream("medicines.csv")
      .pipe(csv())
      .on("data", (data) => medicines.push(data))
      .on("end", () => {
        console.log(
          `CSV file read successfully. Total records: ${medicines.length}`
        );
        resolve(medicines);
      })
      .on("error", (error) => {
        console.error("Error reading CSV file:", error);
        reject(error);
      });
  });
}

// Function to import data from CSV
async function importData() {
  try {
    const medicines = await readCSVFile();
    console.log(
      `Importing ${medicines.length} medicines into Elasticsearch...`
    );

    const batchSize = 100;
    for (let i = 0; i < medicines.length; i += batchSize) {
      const batch = medicines.slice(i, i + batchSize);
      const body = batch.flatMap((doc) => [
        { index: { _index: INDEX_NAME } },
        {
          ...doc,
          name_suggest: {
            input: [doc.name, doc.generic_name], // Adjust as needed
            weight: 1, // Optionally set weights for ranking
          },
        },
      ]);

      await client.bulk({ refresh: true, body });
      console.log(
        `Imported batch of medicines ${i + 1} to ${Math.min(
          i + batchSize,
          medicines.length
        )}`
      );
    }

    await client.indices.refresh({ index: INDEX_NAME });
    console.log("Data import completed successfully");
    return true;
  } catch (error) {
    console.error("Error importing data:", error);
    return false;
  }
}

// Initialize database with retry logic
async function initializeDatabase() {
  let retries = 3;
  while (retries > 0) {
    try {
      console.log("Checking if Elasticsearch is accessible...");
      const isElasticsearchRunning = await checkElasticsearch();
      if (!isElasticsearchRunning) {
        throw new Error("Elasticsearch is not accessible");
      }

      console.log("Creating index...");
      const indexCreated = await createIndex();
      if (!indexCreated) {
        throw new Error("Failed to create index");
      }

      console.log("Importing data from CSV...");
      const dataImported = await importData();
      if (!dataImported) {
        throw new Error("Failed to import data");
      }

      console.log("Database initialization completed successfully");
      return true;
    } catch (error) {
      retries--;
      console.error(
        `Database initialization failed. Retries left: ${retries}`,
        error
      );
      if (retries > 0) {
        console.log("Retrying in 5 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
  return false;
}

// Get distinct categories and manufacturers for filters
app.get("/api/filters", async (req, res) => {
  try {
    console.log("Checking Elasticsearch status for filters...");
    const isRunning = await checkElasticsearch();
    if (!isRunning) {
      throw new Error("Elasticsearch is not running");
    }

    const indexExists = await client.indices.exists({ index: INDEX_NAME });
    console.log(`Index ${INDEX_NAME} exists:`, indexExists);

    if (!indexExists) {
      console.log("Index does not exist, initializing database...");
      const initialized = await initializeDatabase();
      if (!initialized) {
        throw new Error("Failed to initialize database");
      }
    }

    console.log("Fetching categories and manufacturers for filters...");
    const result = await client.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        aggs: {
          categories: { terms: { field: "category", size: 1000 } },
          manufacturers: { terms: { field: "manufacturer", size: 1000 } },
        },
      },
    });

    if (!result.aggregations) {
      console.log("No aggregations in the response.");
      throw new Error("No aggregations in response");
    }

    res.json({
      categories: result.aggregations.categories.buckets.map((b) => b.key),
      manufacturers: result.aggregations.manufacturers.buckets.map(
        (b) => b.key
      ),
    });
  } catch (error) {
    console.error("Error in /api/filters:", error);
    res.status(500).json({
      error: "Failed to fetch filters",
      details: error.message,
      categories: [],
      manufacturers: [],
    });
  }
});

app.get("/api/autocomplete", async (req, res) => {
  const { q } = req.query;

  try {
    const result = await client.search({
      index: INDEX_NAME,
      body: {
        suggest: {
          name_suggest: {
            prefix: q,
            completion: {
              field: "name_suggest",
              fuzzy: {
                fuzziness: "AUTO",
              },
              size: 10, // Limit the number of suggestions
            },
          },
        },
      },
    });

    const suggestions = result.suggest.name_suggest[0].options.map(
      (option) => option.text
    );

    res.json({ suggestions });
  } catch (error) {
    console.error("Autocomplete error:", error);
    res.status(500).json({
      error: "Autocomplete failed",
      details: error.message,
      suggestions: [],
    });
  }
});

// Search endpoint
app.get("/api/search", async (req, res) => {
  const { q, category, manufacturer } = req.query;

  try {
    console.log("Checking Elasticsearch status for search...");
    const isRunning = await checkElasticsearch();
    if (!isRunning) {
      throw new Error("Elasticsearch is not running");
    }

    const body = {
      query: {
        bool: {
          must: [
            q
              ? {
                  multi_match: {
                    query: q,
                    fields: ["name", "generic_name", "description"],
                    fuzziness: "AUTO",
                  },
                }
              : { match_all: {} },
          ],
          filter: [
            ...(category ? [{ term: { category } }] : []),
            ...(manufacturer ? [{ term: { manufacturer } }] : []),
          ],
        },
      },
    };

    console.log("Executing search query:", JSON.stringify(body, null, 2));
    const result = await client.search({ index: INDEX_NAME, body });

    res.json({
      total: result.hits.total.value,
      hits: result.hits.hits.map((hit) => ({
        ...hit._source,
        score: hit._score,
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      error: "Search failed",
      details: error.message,
      hits: [],
    });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

const PORT = 3001;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    const initialized = await initializeDatabase();
    if (!initialized) {
      console.error("Failed to initialize database on startup");
    }
  } catch (error) {
    console.error("Error during startup initialization:", error);
  }
});

import swaggerJSDoc from "swagger-jsdoc";
import swaggerUI from "swagger-ui-express";
import { Express } from "express";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "AdaStaff API",
    version: "3.0.0",
    description: "Employee Planning & Management Microservice for Ada Systems",
  },
  servers: [
    {
      url: "https://adastaff.mindgen.app",
      description: "Production server",
    },
    {
      url: "http://localhost:5003",
      description: "Development server",
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  // Scan TypeScript source files (not compiled JS) so @swagger JSDoc is preserved
  apis: [
    "./src/routes/*.ts",
    "./src/index.ts",
    // Fallback: also scan compiled output in case TS sources aren't available
    "./dist/routes/*.js",
    "./dist/index.js",
  ],
};

const swaggerSpec = swaggerJSDoc(options);

export const setupSwagger = (app: Express): void => {
  app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerSpec));
};
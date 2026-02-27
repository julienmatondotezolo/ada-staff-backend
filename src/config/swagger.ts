import swaggerJSDoc from "swagger-jsdoc";
import swaggerUI from "swagger-ui-express";
import { Express } from "express";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "AdaStaff API",
    version: "1.0.0",
    description: "Employee Planning & Management Microservice for Ada Systems",
  },
  servers: [
    {
      url: "http://localhost:5003",
      description: "Development server",
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ["./src/routes/*.ts", "./src/index.ts"],
};

const swaggerSpec = swaggerJSDoc(options);

export const setupSwagger = (app: Express): void => {
  app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerSpec));
};
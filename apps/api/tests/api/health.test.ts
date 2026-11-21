import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app.ts";
import { handleError } from "../../src/errors.ts";

describe("API health and errors", () => {
  it("serves an uncached health response", async () => {
    await request(app)
      .get("/api/v1/health")
      .expect("Cache-Control", "no-store")
      .expect(200, { status: "ok" });
  });

  it("rejects unexpected query parameters", async () => {
    await request(app)
      .get("/api/v1/health?unexpected=1")
      .expect(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request parameters.",
        },
      });
  });

  it("returns a JSON 404 outside the supported version", async () => {
    await request(app)
      .get("/api/v2/health")
      .expect(404, {
        error: { code: "NOT_FOUND", message: "Route not found." },
      });
  });

  it("returns a safe error for malformed JSON", async () => {
    await request(app)
      .post("/api/v1/health")
      .type("json")
      .send('{"incomplete":')
      .expect(400, {
        error: { code: "BAD_REQUEST", message: "Malformed request." },
      });
  });

  it("hides unexpected error details", async () => {
    const fixture = express();
    fixture.get("/", async () => {
      throw new Error("Private failure details");
    });
    fixture.use(handleError);

    const response = await request(fixture).get("/").expect(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
  });
});

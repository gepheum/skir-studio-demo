#!/usr/bin/env node
// Starts a geometry service at http://localhost:8787/geometry
//
// Run with:
//   npm run server
//
// This service provides two methods:
// 1. AnalyzeTriangle - analyzes properties of a triangle
// 2. AnalyzePolygon - analyzes properties of a polygon

import express, { Request, Response } from "express";
import open from "open";
import { Service, installServiceOnExpressApp } from "skir-client";
import {
  Point,
  PolygonProperties,
  TriangleProperties,
} from "../skirout/geometry.js";
import {
  AnalyzePolygon,
  AnalyzePolygonRequest,
  AnalyzePolygonResponse,
  AnalyzeTriangle,
  AnalyzeTriangleRequest,
  AnalyzeTriangleResponse,
} from "../skirout/service.js";

const app = express();
const port = 8787;

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

/**
 * Calculate the distance between two points
 */
function distance(p1: Point.OrMutable, p2: Point.OrMutable): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the area of a triangle using Heron's formula
 */
function calculateTriangleArea(a: number, b: number, c: number): number {
  const s = (a + b + c) / 2;
  return Math.sqrt(s * (s - a) * (s - b) * (s - c));
}

/**
 * Check if three sides form a right triangle using Pythagorean theorem
 */
function isRightTriangle(a: number, b: number, c: number): boolean {
  const sides = [a, b, c].sort((x, y) => x - y);
  const [side1, side2, hypotenuse] = sides;
  const epsilon = 0.0001;
  return (
    Math.abs(side1 * side1 + side2 * side2 - hypotenuse * hypotenuse) < epsilon
  );
}

/**
 * Calculate the cross product of vectors (p1->p2) and (p1->p3)
 */
function crossProduct(
  p1: Point.OrMutable,
  p2: Point.OrMutable,
  p3: Point.OrMutable,
): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
}

/**
 * Check if a polygon is convex
 */
function isConvex(points: ReadonlyArray<Point.OrMutable>): boolean {
  if (points.length < 3) {
    return false;
  }

  let sign = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    const cross = crossProduct(p1, p2, p3);

    if (Math.abs(cross) < 0.0001) {
      continue; // Collinear points
    }

    const currentSign = cross > 0 ? 1 : -1;

    if (sign === 0) {
      sign = currentSign;
    } else if (sign !== currentSign) {
      return false; // Different signs mean the polygon is concave
    }
  }

  return true;
}

/**
 * Calculate the area of a polygon using the shoelace formula
 */
function calculatePolygonArea(points: ReadonlyArray<Point.OrMutable>): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area) / 2;
}

class GeometryService {
  async analyzeTriangle(
    req: AnalyzeTriangleRequest,
  ): Promise<AnalyzeTriangleResponse> {
    const { pointA, pointB, pointC } = req;

    // Calculate the lengths of the three sides
    const sideAB = distance(pointA, pointB);
    const sideBC = distance(pointB, pointC);
    const sideCA = distance(pointC, pointA);

    const epsilon = 0.0001;

    // Check if it's a valid triangle
    if (
      sideAB + sideBC <= sideCA ||
      sideBC + sideCA <= sideAB ||
      sideCA + sideAB <= sideBC
    ) {
      throw new Error(
        "Invalid triangle: the points are collinear or degenerate",
      );
    }

    // Determine triangle properties
    const isEquilateral =
      Math.abs(sideAB - sideBC) < epsilon &&
      Math.abs(sideBC - sideCA) < epsilon;

    const isIsosceles =
      isEquilateral ||
      Math.abs(sideAB - sideBC) < epsilon ||
      Math.abs(sideBC - sideCA) < epsilon ||
      Math.abs(sideCA - sideAB) < epsilon;

    const isScalene = !isIsosceles;

    const isRight = isRightTriangle(sideAB, sideBC, sideCA);

    const area = calculateTriangleArea(sideAB, sideBC, sideCA);
    const perimeter = sideAB + sideBC + sideCA;

    const properties = TriangleProperties.create({
      isIsosceles,
      isEquilateral,
      isRightTriangle: isRight,
      isScalene,
      area,
      perimeter,
    });

    return AnalyzeTriangleResponse.create({ properties });
  }

  async analyzePolygon(
    req: AnalyzePolygonRequest,
  ): Promise<AnalyzePolygonResponse> {
    const { points } = req;

    if (points.length < 3) {
      throw new Error("A polygon must have at least 3 vertices");
    }

    const convex = isConvex(points);
    const area = convex ? calculatePolygonArea(points) : 0;

    const properties = PolygonProperties.create({
      isConvex: convex,
      area,
      vertexCount: points.length,
    });

    return AnalyzePolygonResponse.create({ properties });
  }
}

const geometryService = new GeometryService();

installServiceOnExpressApp(
  app,
  "/geometry",
  new Service({
    // Optional service configuration goes here
  })
    .addMethod(
      AnalyzeTriangle,
      GeometryService.prototype.analyzeTriangle.bind(geometryService),
    )
    .addMethod(
      AnalyzePolygon,
      GeometryService.prototype.analyzePolygon.bind(geometryService),
    ),
  express.text,
  express.json,
);

app.get("/", (req: Request, res: Response) => {
  res.send(`
    <html>
      <head><title>Geometry Service</title></head>
      <body>
        <h1>Geometry Service</h1>
        <p>This Skir service provides geometric analysis methods:</p>
        <ul>
          <li><strong>AnalyzeTriangle</strong>: Analyzes properties of a triangle (isosceles, equilateral, right triangle, etc.)</li>
          <li><strong>AnalyzePolygon</strong>: Analyzes properties of a polygon (convexity, area)</li>
        </ul>
        <p>Service endpoint: <code>http://localhost:${port}/geometry</code></p>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Geometry service is running on http://localhost:${port}/`);
  console.log(`Service endpoint: http://localhost:${port}/geometry`);
  open(`http://localhost:${port}/geometry?studio`);
});
